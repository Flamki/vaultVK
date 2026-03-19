#include "vaultkv/wal.h"

#include <cstring>
#include <fstream>
#include <vector>

#ifdef __linux__
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

#include "vaultkv/util.h"

namespace vaultkv {
namespace {

constexpr size_t kFixedRecordHeader = 4 + 8 + 8 + 1 + 2 + 4 + 4 + 12 + 16;

void append_u8(std::string* out, uint8_t v) { out->push_back(static_cast<char>(v)); }

Status parse_fields(size_t offset,
                    const uint8_t* base,
                    size_t limit,
                    uint64_t* timestamp_ns,
                    uint64_t* seq,
                    WalOp* op,
                    uint16_t* key_len,
                    uint32_t* val_len,
                    uint32_t* cipher_len,
                    std::array<uint8_t, 12>* nonce,
                    std::array<uint8_t, 16>* tag,
                    size_t* payload_offset,
                    size_t* total_record_len) {
  if (offset + kFixedRecordHeader > limit) {
    return Status::Corruption("record header truncated");
  }
  const uint8_t* p = base + offset;
  const uint32_t crc = util::read_le<uint32_t>(p);
  if (crc == 0) return Status::NotFound("end of wal");
  p += 4;

  *timestamp_ns = util::read_le<uint64_t>(p);
  p += 8;
  *seq = util::read_le<uint64_t>(p);
  p += 8;
  *op = static_cast<WalOp>(p[0]);
  p += 1;
  *key_len = util::read_le<uint16_t>(p);
  p += 2;
  *val_len = util::read_le<uint32_t>(p);
  p += 4;
  *cipher_len = util::read_le<uint32_t>(p);
  p += 4;

  std::memcpy(nonce->data(), p, nonce->size());
  p += nonce->size();
  std::memcpy(tag->data(), p, tag->size());
  p += tag->size();

  const size_t header_bytes = static_cast<size_t>(p - (base + offset));
  if (*cipher_len > (128 * 1024 * 1024)) return Status::Corruption("ciphertext length too large");
  const size_t total = header_bytes + static_cast<size_t>(*cipher_len);
  if (offset + total > limit) return Status::Corruption("record body truncated");

  const uint32_t check = util::crc32(base + offset + 4, total - 4);
  if (check != crc) return Status::Corruption("crc mismatch");

  *payload_offset = header_bytes;
  *total_record_len = total;
  return Status::Ok();
}

}  // namespace

Wal::Wal(std::filesystem::path path, AesGcm256 crypto, size_t max_size_bytes)
    : path_(std::move(path)), crypto_(std::move(crypto)), capacity_(max_size_bytes) {}

Wal::~Wal() { Close(); }

Status Wal::Open() {
  std::lock_guard<std::mutex> lock(mu_);
  if (open_) return Status::Ok();

  std::error_code ec;
  std::filesystem::create_directories(path_.parent_path(), ec);
  if (ec) return Status::IoError("failed creating wal dir: " + ec.message());

#ifdef __linux__
  fd_ = open(path_.string().c_str(), O_RDWR | O_CREAT, 0644);
  if (fd_ < 0) return Status::IoError(util::format_errno("open wal"));
  if (ftruncate(fd_, static_cast<off_t>(capacity_)) != 0) {
    const std::string err = util::format_errno("ftruncate wal");
    close(fd_);
    fd_ = -1;
    return Status::IoError(err);
  }
  base_ = static_cast<uint8_t*>(
      mmap(nullptr, capacity_, PROT_READ | PROT_WRITE, MAP_SHARED, fd_, 0));
  if (base_ == MAP_FAILED || base_ == nullptr) {
    const std::string err = util::format_errno("mmap wal");
    close(fd_);
    fd_ = -1;
    base_ = nullptr;
    return Status::IoError(err);
  }
#else
  bytes_.assign(capacity_, 0);
  if (std::filesystem::exists(path_)) {
    std::ifstream in(path_, std::ios::binary);
    if (in) {
      in.read(reinterpret_cast<char*>(bytes_.data()), static_cast<std::streamsize>(bytes_.size()));
    }
  }
#endif

  FindEndAndLastSeq();
  open_ = true;
  return Status::Ok();
}

Status Wal::Close() {
  std::lock_guard<std::mutex> lock(mu_);
  if (!open_) return Status::Ok();

  Status st = Sync();

#ifdef __linux__
  if (base_ != nullptr) {
    munmap(base_, capacity_);
    base_ = nullptr;
  }
  if (fd_ >= 0) {
    close(fd_);
    fd_ = -1;
  }
#else
  Status flush = FlushFallbackFile();
  if (!flush.ok()) st = flush;
  bytes_.clear();
#endif
  open_ = false;
  return st;
}

Status Wal::Sync() {
  if (!open_) return Status::IoError("wal not open");
#ifdef __linux__
  if (msync(base_, write_offset_, MS_SYNC) != 0) {
    return Status::IoError(util::format_errno("msync wal"));
  }
  return Status::Ok();
#else
  return FlushFallbackFile();
#endif
}

Result<uint64_t> Wal::Append(WalOp op, std::string_view key, std::string_view value) {
  std::lock_guard<std::mutex> lock(mu_);
  if (!open_) return Result<uint64_t>::Err(Status::IoError("wal not open"));
  if (key.size() > UINT16_MAX) return Result<uint64_t>::Err(Status::InvalidArgument("key too large"));
  if (value.size() > UINT32_MAX) return Result<uint64_t>::Err(Status::InvalidArgument("value too large"));

  WalRecord rec;
  rec.op = op;
  rec.seq = last_seq_ + 1;
  rec.timestamp_ns = util::now_unix_nanos();
  rec.key = std::string(key);
  rec.value = std::string(value);

  Status st;
  std::string encoded = SerializeRecord(rec, &st);
  if (!st.ok()) return Result<uint64_t>::Err(st);
  if (write_offset_ + encoded.size() > capacity_) {
    return Result<uint64_t>::Err(Status::IoError("wal segment full (rotation not yet implemented)"));
  }

#ifdef __linux__
  std::memcpy(base_ + write_offset_, encoded.data(), encoded.size());
#else
  std::memcpy(bytes_.data() + write_offset_, encoded.data(), encoded.size());
#endif

  write_offset_ += encoded.size();
  last_seq_ = rec.seq;
  return Result<uint64_t>::Ok(rec.seq, rec.seq);
}

Status Wal::Replay(const std::function<Status(const WalRecord&)>& fn, bool stop_at_corruption) {
  std::lock_guard<std::mutex> lock(mu_);
  if (!open_) return Status::IoError("wal not open");
  size_t off = 0;
  while (off < write_offset_) {
    auto parsed = ParseRecordAt(off);
    if (!parsed.ok()) {
      if (parsed.status.code == StatusCode::kNotFound) break;
      if (stop_at_corruption) return parsed.status;
      break;
    }
    Status s = fn(parsed.value->record);
    if (!s.ok()) return s;
    off = parsed.value->next_offset;
  }
  return Status::Ok();
}

std::string Wal::SerializeRecord(const WalRecord& rec, Status* st) const {
  std::string plain;
  plain.reserve(rec.key.size() + rec.value.size());
  plain.append(rec.key);
  plain.append(rec.value);

  auto cipher_opt = crypto_.Encrypt(plain);
  if (!cipher_opt) {
    if (st) *st = Status::CryptoError("wal encrypt failed");
    return {};
  }
  const CipherBlob& c = *cipher_opt;

  std::string out;
  out.reserve(kFixedRecordHeader + c.ciphertext.size());
  util::append_le<uint32_t>(&out, 0);  // crc placeholder
  util::append_le<uint64_t>(&out, rec.timestamp_ns);
  util::append_le<uint64_t>(&out, rec.seq);
  append_u8(&out, static_cast<uint8_t>(rec.op));
  util::append_le<uint16_t>(&out, static_cast<uint16_t>(rec.key.size()));
  util::append_le<uint32_t>(&out, static_cast<uint32_t>(rec.value.size()));
  util::append_le<uint32_t>(&out, static_cast<uint32_t>(c.ciphertext.size()));
  out.append(reinterpret_cast<const char*>(c.nonce.data()), c.nonce.size());
  out.append(reinterpret_cast<const char*>(c.tag.data()), c.tag.size());
  out.append(reinterpret_cast<const char*>(c.ciphertext.data()), c.ciphertext.size());

  const uint32_t crc = util::crc32(reinterpret_cast<const uint8_t*>(out.data() + 4), out.size() - 4);
  for (int i = 0; i < 4; ++i) {
    out[static_cast<size_t>(i)] = static_cast<char>((crc >> (8 * i)) & 0xFFu);
  }
  if (st) *st = Status::Ok();
  return out;
}

Result<Wal::ParsedRecord> Wal::ParseRecordAt(size_t offset) const {
  if (offset + 4 > capacity_) return Result<ParsedRecord>::Err(Status::NotFound("end"));

#ifdef __linux__
  const uint8_t* base = base_;
#else
  const uint8_t* base = bytes_.data();
#endif

  uint64_t ts = 0;
  uint64_t seq = 0;
  WalOp op = WalOp::kSet;
  uint16_t key_len = 0;
  uint32_t val_len = 0;
  uint32_t cipher_len = 0;
  std::array<uint8_t, 12> nonce{};
  std::array<uint8_t, 16> tag{};
  size_t payload_off = 0;
  size_t total_len = 0;

  Status parsed = parse_fields(offset, base, capacity_, &ts, &seq, &op, &key_len, &val_len, &cipher_len, &nonce,
                               &tag, &payload_off, &total_len);
  if (!parsed.ok()) return Result<ParsedRecord>::Err(parsed);

  CipherBlob blob;
  blob.nonce = nonce;
  blob.tag = tag;
  blob.ciphertext.assign(base + offset + payload_off, base + offset + payload_off + cipher_len);

  std::string plain;
  if (!crypto_.Decrypt(blob, "", &plain)) {
    return Result<ParsedRecord>::Err(Status::Corruption("wal decrypt failed"));
  }
  if (plain.size() != static_cast<size_t>(key_len) + static_cast<size_t>(val_len)) {
    return Result<ParsedRecord>::Err(Status::Corruption("wal key/value length mismatch"));
  }

  ParsedRecord out;
  out.record.op = op;
  out.record.seq = seq;
  out.record.timestamp_ns = ts;
  out.record.key.assign(plain.data(), key_len);
  out.record.value.assign(plain.data() + key_len, val_len);
  out.next_offset = offset + total_len;
  return Result<ParsedRecord>::Ok(out);
}

void Wal::FindEndAndLastSeq() {
  write_offset_ = 0;
  last_seq_ = 0;
  while (write_offset_ < capacity_) {
    auto rec = ParseRecordAt(write_offset_);
    if (!rec.ok()) {
      if (rec.status.code == StatusCode::kNotFound) break;
      break;
    }
    write_offset_ = rec.value->next_offset;
    last_seq_ = rec.value->record.seq;
  }
}

Status Wal::FlushFallbackFile() {
#ifndef __linux__
  std::ofstream out(path_, std::ios::binary | std::ios::trunc);
  if (!out) return Status::IoError("failed to open wal for flush");
  out.write(reinterpret_cast<const char*>(bytes_.data()), static_cast<std::streamsize>(write_offset_));
  if (!out) return Status::IoError("failed writing wal fallback data");
#endif
  return Status::Ok();
}

}  // namespace vaultkv
