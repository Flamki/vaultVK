#include "vaultkv/storage_engine.h"

#include <algorithm>
#include <chrono>
#include <map>

#include "vaultkv/util.h"

namespace vaultkv {
namespace {

uint16_t status_to_error_code(const Status& s) {
  switch (s.code) {
    case StatusCode::kInvalidArgument:
      return 400;
    case StatusCode::kNotFound:
      return 404;
    case StatusCode::kNoQuorum:
      return 503;
    case StatusCode::kUnsupported:
      return 501;
    default:
      return 500;
  }
}

}  // namespace

StorageEngine::StorageEngine(EngineOptions options)
    : options_(std::move(options)),
      crypto_(options_.encryption_key),
      wal_(std::make_unique<Wal>(options_.data_dir / "wal" / "segment-000.wal", crypto_,
                                 options_.wal_segment_size_bytes)),
      memtable_(std::make_unique<MemTable>(options_.memtable_budget_bytes)),
      compaction_(std::make_unique<CompactionManager>(options_.data_dir, crypto_)),
      replication_(std::make_unique<ReplicationManager>(options_.node_id)) {}

StorageEngine::~StorageEngine() { Close(); }

Status StorageEngine::Open() {
  if (open_.load()) return Status::Ok();

  std::error_code ec;
  std::filesystem::create_directories(options_.data_dir / "l0", ec);
  if (ec) return Status::IoError("failed creating l0 dir: " + ec.message());
  std::filesystem::create_directories(options_.data_dir / "l1", ec);
  if (ec) return Status::IoError("failed creating l1 dir: " + ec.message());

  Status st = wal_->Open();
  if (!st.ok()) return st;

  st = LoadSstablesFromDisk();
  if (!st.ok()) return st;

  st = ReplayWal();
  if (!st.ok()) return st;

  open_.store(true);
  return Status::Ok();
}

Status StorageEngine::Close() {
  if (!open_.exchange(false)) return Status::Ok();
  Status st = wal_->Sync();
  Status close = wal_->Close();
  if (!close.ok()) st = close;
  return st;
}

void StorageEngine::SetReplicationPeers(std::vector<ReplicationPeer> peers,
                                        std::shared_ptr<IReplicationTransport> transport) {
  replication_->SetTransport(std::move(transport));
  replication_->SetPeers(std::move(peers));
}

Status StorageEngine::ReplayWal() {
  return wal_->Replay([this](const WalRecord& rec) -> Status {
    if (rec.op == WalOp::kSet) return memtable_->Set(rec.key, rec.value, rec.seq);
    if (rec.op == WalOp::kDelete) return memtable_->Delete(rec.key, rec.seq);
    return Status::Ok();
  });
}

Status StorageEngine::LoadSstablesFromDisk() {
  std::vector<std::filesystem::path> l0;
  std::vector<std::filesystem::path> l1;
  std::error_code ec;
  for (const auto& entry : std::filesystem::directory_iterator(options_.data_dir / "l0", ec)) {
    if (!ec && entry.path().extension() == ".sst") l0.push_back(entry.path());
  }
  ec.clear();
  for (const auto& entry : std::filesystem::directory_iterator(options_.data_dir / "l1", ec)) {
    if (!ec && entry.path().extension() == ".sst") l1.push_back(entry.path());
  }
  std::sort(l0.begin(), l0.end());
  std::sort(l1.begin(), l1.end());

  std::unique_lock<std::shared_mutex> lock(tables_mu_);
  l0_tables_.clear();
  l1_tables_.clear();

  for (const auto& p : l0) {
    auto reader = std::make_shared<SstableReader>(p, crypto_);
    Status st = reader->Open();
    if (!st.ok()) return st;
    l0_tables_.push_back(std::move(reader));
  }
  for (const auto& p : l1) {
    auto reader = std::make_shared<SstableReader>(p, crypto_);
    Status st = reader->Open();
    if (!st.ok()) return st;
    l1_tables_.push_back(std::move(reader));
  }
  return Status::Ok();
}

std::filesystem::path StorageEngine::NextSstablePath(int level) {
  const uint64_t id = next_sstable_id_.fetch_add(1);
  const std::string name = "sst-" + std::to_string(util::now_unix_nanos()) + "-" + std::to_string(id) + ".sst";
  return options_.data_dir / (level == 0 ? "l0" : "l1") / name;
}

Status StorageEngine::InstallNewL0(const std::filesystem::path& path) {
  auto reader = std::make_shared<SstableReader>(path, crypto_);
  Status st = reader->Open();
  if (!st.ok()) return st;
  std::unique_lock<std::shared_mutex> lock(tables_mu_);
  l0_tables_.push_back(std::move(reader));
  return Status::Ok();
}

Status StorageEngine::Set(std::string_view key, std::string_view value) {
  if (!open_.load()) return Status::IoError("engine not open");
  if (key.empty()) return Status::InvalidArgument("key must not be empty");

  auto seq = wal_->Append(WalOp::kSet, key, value);
  if (!seq.ok()) return seq.status;

  WalRecord rec{WalOp::kSet, seq.status.seq, util::now_unix_nanos(), std::string(key), std::string(value)};
  if (options_.enable_replication && options_.quorum_size > 1) {
    auto repl = replication_->ReplicateToQuorum(rec, options_.quorum_size, std::chrono::milliseconds(300));
    if (!repl.ok()) return repl.status;
  }

  Status st = memtable_->Set(key, value, seq.status.seq);
  if (!st.ok()) return st;

  if (memtable_->approx_memory() >= memtable_->memory_budget()) {
    st = FlushMemTable();
    if (!st.ok()) return st;
  }
  return Status::Ok(seq.status.seq);
}

Status StorageEngine::Delete(std::string_view key) {
  if (!open_.load()) return Status::IoError("engine not open");
  if (key.empty()) return Status::InvalidArgument("key must not be empty");

  auto seq = wal_->Append(WalOp::kDelete, key, "");
  if (!seq.ok()) return seq.status;

  WalRecord rec{WalOp::kDelete, seq.status.seq, util::now_unix_nanos(), std::string(key), ""};
  if (options_.enable_replication && options_.quorum_size > 1) {
    auto repl = replication_->ReplicateToQuorum(rec, options_.quorum_size, std::chrono::milliseconds(300));
    if (!repl.ok()) return repl.status;
  }
  return memtable_->Delete(key, seq.status.seq);
}

Result<std::string> StorageEngine::Get(std::string_view key) const {
  if (!open_.load()) return Result<std::string>::Err(Status::IoError("engine not open"));
  if (key.empty()) return Result<std::string>::Err(Status::InvalidArgument("key must not be empty"));

  auto mem = memtable_->Get(key);
  if (mem.ok()) {
    if (mem.value->tombstone) return Result<std::string>::Err(Status::NotFound("deleted"));
    return Result<std::string>::Ok(mem.value->value, mem.value->seq);
  }

  std::shared_lock<std::shared_mutex> lock(tables_mu_);
  for (auto it = l0_tables_.rbegin(); it != l0_tables_.rend(); ++it) {
    auto r = (*it)->Get(key);
    if (!r.ok()) continue;
    if (r.value->tombstone) return Result<std::string>::Err(Status::NotFound("deleted"));
    return Result<std::string>::Ok(r.value->value, r.value->seq);
  }
  for (auto it = l1_tables_.rbegin(); it != l1_tables_.rend(); ++it) {
    auto r = (*it)->Get(key);
    if (!r.ok()) continue;
    if (r.value->tombstone) return Result<std::string>::Err(Status::NotFound("deleted"));
    return Result<std::string>::Ok(r.value->value, r.value->seq);
  }

  return Result<std::string>::Err(Status::NotFound("key not found"));
}

Result<std::vector<std::pair<std::string, std::string>>> StorageEngine::ScanPrefix(std::string_view prefix,
                                                                                    size_t limit) const {
  if (!open_.load()) return Result<std::vector<std::pair<std::string, std::string>>>::Err(
      Status::IoError("engine not open"));
  if (limit == 0) limit = 100;

  struct Candidate {
    uint64_t seq;
    bool tombstone;
    std::string value;
  };
  std::map<std::string, Candidate> merged;

  for (const auto& [k, v] : memtable_->SnapshotSorted(true)) {
    if (k.compare(0, prefix.size(), prefix) != 0) continue;
    auto it = merged.find(k);
    if (it == merged.end() || v.seq > it->second.seq) {
      merged[k] = Candidate{v.seq, v.tombstone, v.value};
    }
  }

  std::shared_lock<std::shared_mutex> lock(tables_mu_);
  for (auto it = l0_tables_.rbegin(); it != l0_tables_.rend(); ++it) {
    for (const auto& rec : (*it)->ScanPrefix(prefix, limit * 2)) {
      auto cur = merged.find(rec.key);
      if (cur == merged.end() || rec.seq > cur->second.seq) {
        merged[rec.key] = Candidate{rec.seq, rec.tombstone, rec.value};
      }
    }
  }
  for (auto it = l1_tables_.rbegin(); it != l1_tables_.rend(); ++it) {
    for (const auto& rec : (*it)->ScanPrefix(prefix, limit * 2)) {
      auto cur = merged.find(rec.key);
      if (cur == merged.end() || rec.seq > cur->second.seq) {
        merged[rec.key] = Candidate{rec.seq, rec.tombstone, rec.value};
      }
    }
  }

  std::vector<std::pair<std::string, std::string>> out;
  out.reserve(limit);
  for (const auto& [k, v] : merged) {
    if (v.tombstone) continue;
    out.emplace_back(k, v.value);
    if (out.size() >= limit) break;
  }
  return Result<std::vector<std::pair<std::string, std::string>>>::Ok(std::move(out));
}

Status StorageEngine::FlushMemTable() {
  if (!open_.load()) return Status::IoError("engine not open");
  auto records = memtable_->DrainSorted(true);
  if (records.empty()) return Status::Ok();

  SstableBuilder builder(NextSstablePath(0), crypto_);
  for (const auto& [k, v] : records) {
    builder.Add(k, v.value, v.seq, v.tombstone);
  }
  SstableMeta meta;
  Status st = builder.Build(&meta);
  if (!st.ok()) return st;

  st = InstallNewL0(meta.path);
  if (!st.ok()) return st;
  return MaybeCompact();
}

Status StorageEngine::MaybeCompact() {
  std::vector<std::filesystem::path> l0_paths;
  {
    std::shared_lock<std::shared_mutex> lock(tables_mu_);
    if (l0_tables_.size() < 4) return Status::Ok();
    l0_paths.reserve(l0_tables_.size());
    for (const auto& t : l0_tables_) l0_paths.push_back(t->path());
  }

  const auto out_path = NextSstablePath(1);
  Status st = compaction_->CompactLevel0ToLevel1(l0_paths, out_path);
  if (!st.ok()) return st;

  auto new_reader = std::make_shared<SstableReader>(out_path, crypto_);
  st = new_reader->Open();
  if (!st.ok()) return st;

  {
    std::unique_lock<std::shared_mutex> lock(tables_mu_);
    l1_tables_.push_back(new_reader);
    l0_tables_.clear();
  }
  for (const auto& p : l0_paths) {
    std::error_code ec;
    std::filesystem::remove(p, ec);
  }
  return Status::Ok();
}

EngineStats StorageEngine::GetStats() const {
  std::shared_lock<std::shared_mutex> lock(tables_mu_);
  return EngineStats{
      wal_->last_seq(),
      memtable_->size(),
      l0_tables_.size(),
      l1_tables_.size(),
  };
}

std::vector<uint8_t> StorageEngine::HandleFrame(const protocol::Frame& frame) {
  protocol::Command cmd;
  std::string parse_err;
  if (!protocol::Protocol::DecodeCommand(frame, &cmd, &parse_err)) {
    return protocol::Protocol::EncodeError(400, parse_err);
  }

  switch (cmd.type) {
    case protocol::OpType::PING:
      return protocol::Protocol::EncodeAck(wal_->last_seq(), "PONG");

    case protocol::OpType::SET: {
      Status st = Set(cmd.key, cmd.value);
      if (!st.ok()) return protocol::Protocol::EncodeError(status_to_error_code(st), st.message);
      return protocol::Protocol::EncodeAck(st.seq, "OK");
    }

    case protocol::OpType::GET: {
      auto v = Get(cmd.key);
      if (!v.ok()) return protocol::Protocol::EncodeError(status_to_error_code(v.status), v.status.message);
      return protocol::Protocol::EncodeValue(*v.value);
    }

    case protocol::OpType::DEL: {
      Status st = Delete(cmd.key);
      if (!st.ok()) return protocol::Protocol::EncodeError(status_to_error_code(st), st.message);
      return protocol::Protocol::EncodeAck(st.seq, "OK");
    }

    case protocol::OpType::SCAN: {
      auto out = ScanPrefix(cmd.prefix, cmd.limit);
      if (!out.ok()) return protocol::Protocol::EncodeError(status_to_error_code(out.status), out.status.message);
      return protocol::Protocol::EncodeScanResult(*out.value);
    }

    default:
      return protocol::Protocol::EncodeError(501, "unsupported opcode");
  }
}

}  // namespace vaultkv
