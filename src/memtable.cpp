#include "vaultkv/memtable.h"

#include <algorithm>
#include <mutex>

namespace vaultkv {

MemTable::MemTable(size_t memory_budget_bytes) : memory_budget_bytes_(memory_budget_bytes) {}

size_t MemTable::EstimateBytesForEntry(std::string_view key, const MemValue& value) {
  return sizeof(MemValue) + key.size() + value.value.size();
}

Status MemTable::Set(std::string_view key, std::string_view value, uint64_t seq) {
  if (key.empty()) return Status::InvalidArgument("key must not be empty");
  std::unique_lock<std::shared_mutex> lock(mu_);

  const auto it = table_.find(std::string(key));
  if (it != table_.end()) {
    approx_bytes_ -= EstimateBytesForEntry(it->first, it->second);
  }

  MemValue mv;
  mv.value = std::string(value);
  mv.seq = seq;
  mv.tombstone = false;
  table_[std::string(key)] = mv;
  approx_bytes_ += EstimateBytesForEntry(key, mv);
  return Status::Ok(seq);
}

Status MemTable::Delete(std::string_view key, uint64_t seq) {
  if (key.empty()) return Status::InvalidArgument("key must not be empty");
  std::unique_lock<std::shared_mutex> lock(mu_);

  const auto it = table_.find(std::string(key));
  if (it != table_.end()) {
    approx_bytes_ -= EstimateBytesForEntry(it->first, it->second);
  }

  MemValue mv;
  mv.value.clear();
  mv.seq = seq;
  mv.tombstone = true;
  table_[std::string(key)] = mv;
  approx_bytes_ += EstimateBytesForEntry(key, mv);
  return Status::Ok(seq);
}

Result<MemValue> MemTable::Get(std::string_view key) const {
  std::shared_lock<std::shared_mutex> lock(mu_);
  const auto it = table_.find(std::string(key));
  if (it == table_.end()) return Result<MemValue>::Err(Status::NotFound("key not found"));
  return Result<MemValue>::Ok(it->second, it->second.seq);
}

std::vector<std::pair<std::string, MemValue>> MemTable::SnapshotSorted(bool include_tombstones) const {
  std::vector<std::pair<std::string, MemValue>> out;
  {
    std::shared_lock<std::shared_mutex> lock(mu_);
    out.reserve(table_.size());
    for (const auto& [k, v] : table_) {
      if (!include_tombstones && v.tombstone) continue;
      out.emplace_back(k, v);
    }
  }
  std::sort(out.begin(), out.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
  return out;
}

std::vector<std::pair<std::string, MemValue>> MemTable::DrainSorted(bool include_tombstones) {
  std::vector<std::pair<std::string, MemValue>> out;
  {
    std::unique_lock<std::shared_mutex> lock(mu_);
    out.reserve(table_.size());
    for (const auto& [k, v] : table_) {
      if (!include_tombstones && v.tombstone) continue;
      out.emplace_back(k, v);
    }
    table_.clear();
    approx_bytes_ = 0;
  }
  std::sort(out.begin(), out.end(), [](const auto& a, const auto& b) { return a.first < b.first; });
  return out;
}

size_t MemTable::size() const {
  std::shared_lock<std::shared_mutex> lock(mu_);
  return table_.size();
}

size_t MemTable::approx_memory() const {
  std::shared_lock<std::shared_mutex> lock(mu_);
  return approx_bytes_;
}

}  // namespace vaultkv
