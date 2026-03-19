#pragma once

#include <cstdint>
#include <shared_mutex>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "vaultkv/types.h"

namespace vaultkv {

struct MemValue {
  std::string value;
  uint64_t seq = 0;
  bool tombstone = false;
};

class MemTable {
 public:
  explicit MemTable(size_t memory_budget_bytes);

  Status Set(std::string_view key, std::string_view value, uint64_t seq);
  Status Delete(std::string_view key, uint64_t seq);
  Result<MemValue> Get(std::string_view key) const;

  std::vector<std::pair<std::string, MemValue>> SnapshotSorted(bool include_tombstones) const;
  std::vector<std::pair<std::string, MemValue>> DrainSorted(bool include_tombstones);

  size_t size() const;
  size_t approx_memory() const;
  size_t memory_budget() const { return memory_budget_bytes_; }

 private:
  static size_t EstimateBytesForEntry(std::string_view key, const MemValue& value);

  size_t memory_budget_bytes_;
  mutable std::shared_mutex mu_;
  std::unordered_map<std::string, MemValue> table_;
  size_t approx_bytes_ = 0;
};

}  // namespace vaultkv

