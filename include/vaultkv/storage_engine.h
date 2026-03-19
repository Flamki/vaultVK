#pragma once

#include <atomic>
#include <filesystem>
#include <memory>
#include <shared_mutex>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "vaultkv/compaction.h"
#include "vaultkv/crypto.h"
#include "vaultkv/memtable.h"
#include "vaultkv/protocol.h"
#include "vaultkv/replication.h"
#include "vaultkv/sstable.h"
#include "vaultkv/types.h"
#include "vaultkv/wal.h"

namespace vaultkv {

struct EngineStats {
  uint64_t wal_last_seq = 0;
  size_t memtable_size = 0;
  size_t l0_tables = 0;
  size_t l1_tables = 0;
};

class StorageEngine {
 public:
  explicit StorageEngine(EngineOptions options);
  ~StorageEngine();

  Status Open();
  Status Close();

  Status Set(std::string_view key, std::string_view value);
  Status Delete(std::string_view key);
  Result<std::string> Get(std::string_view key) const;
  Result<std::vector<std::pair<std::string, std::string>>> ScanPrefix(std::string_view prefix,
                                                                       size_t limit) const;

  std::vector<uint8_t> HandleFrame(const protocol::Frame& frame);

  Status FlushMemTable();
  Status MaybeCompact();

  EngineStats GetStats() const;

  void SetReplicationPeers(std::vector<ReplicationPeer> peers,
                           std::shared_ptr<IReplicationTransport> transport);

 private:
  Status ReplayWal();
  Status LoadSstablesFromDisk();
  Status InstallNewL0(const std::filesystem::path& path);
  std::filesystem::path NextSstablePath(int level);

  EngineOptions options_;
  AesGcm256 crypto_;

  std::unique_ptr<Wal> wal_;
  std::unique_ptr<MemTable> memtable_;
  std::unique_ptr<CompactionManager> compaction_;
  std::unique_ptr<ReplicationManager> replication_;

  mutable std::shared_mutex tables_mu_;
  std::vector<std::shared_ptr<SstableReader>> l0_tables_;
  std::vector<std::shared_ptr<SstableReader>> l1_tables_;

  std::atomic<uint64_t> next_sstable_id_{1};
  std::atomic<bool> open_{false};
};

}  // namespace vaultkv
