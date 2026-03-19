#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <mutex>
#include <string>
#include <string_view>
#include <vector>

#include "vaultkv/crypto.h"
#include "vaultkv/types.h"

namespace vaultkv {

enum class WalOp : uint8_t {
  kSet = 0,
  kDelete = 1,
  kCheckpointBegin = 2,
  kCheckpointEnd = 3,
};

struct WalRecord {
  WalOp op = WalOp::kSet;
  uint64_t seq = 0;
  uint64_t timestamp_ns = 0;
  std::string key;
  std::string value;
};

class Wal {
 public:
  Wal(std::filesystem::path path, AesGcm256 crypto, size_t max_size_bytes);
  ~Wal();

  Status Open();
  Status Close();
  Status Sync();

  Result<uint64_t> Append(WalOp op, std::string_view key, std::string_view value);
  Status Replay(const std::function<Status(const WalRecord&)>& fn, bool stop_at_corruption = true);

  uint64_t last_seq() const { return last_seq_; }
  size_t write_offset() const { return write_offset_; }
  const std::filesystem::path& path() const { return path_; }

 private:
  struct ParsedRecord {
    WalRecord record;
    size_t next_offset = 0;
  };

  std::string SerializeRecord(const WalRecord& rec, Status* st) const;
  Result<ParsedRecord> ParseRecordAt(size_t offset) const;
  void FindEndAndLastSeq();
  Status FlushFallbackFile();

  std::filesystem::path path_;
  AesGcm256 crypto_;
  size_t capacity_;

  mutable std::mutex mu_;
  bool open_ = false;
  uint64_t last_seq_ = 0;
  size_t write_offset_ = 0;

#ifdef __linux__
  int fd_ = -1;
  uint8_t* base_ = nullptr;
#else
  std::vector<uint8_t> bytes_;
#endif
};

}  // namespace vaultkv
