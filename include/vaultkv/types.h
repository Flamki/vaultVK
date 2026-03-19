#pragma once

#include <array>
#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>

namespace vaultkv {

enum class StatusCode {
  kOk = 0,
  kNotFound,
  kInvalidArgument,
  kIoError,
  kCorruption,
  kCryptoError,
  kNoQuorum,
  kNotLeader,
  kUnsupported,
};

struct Status {
  StatusCode code = StatusCode::kOk;
  std::string message;
  uint64_t seq = 0;

  [[nodiscard]] bool ok() const { return code == StatusCode::kOk; }

  static Status Ok(uint64_t s = 0) { return Status{StatusCode::kOk, "", s}; }
  static Status NotFound(std::string msg = {}) {
    return Status{StatusCode::kNotFound, std::move(msg), 0};
  }
  static Status InvalidArgument(std::string msg) {
    return Status{StatusCode::kInvalidArgument, std::move(msg), 0};
  }
  static Status IoError(std::string msg) {
    return Status{StatusCode::kIoError, std::move(msg), 0};
  }
  static Status Corruption(std::string msg) {
    return Status{StatusCode::kCorruption, std::move(msg), 0};
  }
  static Status CryptoError(std::string msg) {
    return Status{StatusCode::kCryptoError, std::move(msg), 0};
  }
  static Status NoQuorum(std::string msg) {
    return Status{StatusCode::kNoQuorum, std::move(msg), 0};
  }
  static Status Unsupported(std::string msg) {
    return Status{StatusCode::kUnsupported, std::move(msg), 0};
  }
};

template <typename T>
struct Result {
  Status status{};
  std::optional<T> value;

  [[nodiscard]] bool ok() const { return status.ok() && value.has_value(); }

  static Result<T> Ok(T v, uint64_t seq = 0) {
    return Result<T>{Status::Ok(seq), std::move(v)};
  }
  static Result<T> Err(Status s) { return Result<T>{std::move(s), std::nullopt}; }
};

struct EngineOptions {
  std::filesystem::path data_dir = "data";
  uint16_t port = 7379;
  size_t wal_segment_size_bytes = 64 * 1024 * 1024;
  size_t memtable_budget_bytes = 32 * 1024 * 1024;
  std::array<uint8_t, 32> encryption_key{};
  int node_id = 1;
  bool enable_replication = false;
  size_t quorum_size = 2;
  bool leader_only_reads = false;
};

}  // namespace vaultkv

