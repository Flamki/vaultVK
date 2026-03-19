#pragma once

#include <chrono>
#include <functional>
#include <memory>
#include <mutex>
#include <unordered_map>
#include <vector>

#include "vaultkv/types.h"
#include "vaultkv/wal.h"

namespace vaultkv {

struct ReplicationPeer {
  int node_id = 0;
  std::string host;
  uint16_t port = 0;
};

class IReplicationTransport {
 public:
  virtual ~IReplicationTransport() = default;
  virtual bool Replicate(const WalRecord& rec,
                         const ReplicationPeer& peer,
                         std::chrono::milliseconds timeout) = 0;
};

class MemoryReplicationTransport final : public IReplicationTransport {
 public:
  using Handler = std::function<bool(const WalRecord&)>;

  void RegisterHandler(int node_id, Handler handler);
  bool Replicate(const WalRecord& rec,
                 const ReplicationPeer& peer,
                 std::chrono::milliseconds timeout) override;

 private:
  std::mutex mu_;
  std::unordered_map<int, Handler> handlers_;
};

class TcpReplicationTransport final : public IReplicationTransport {
 public:
  bool Replicate(const WalRecord& rec,
                 const ReplicationPeer& peer,
                 std::chrono::milliseconds timeout) override;
};

class ReplicationManager {
 public:
  explicit ReplicationManager(int node_id);

  void SetTransport(std::shared_ptr<IReplicationTransport> transport);
  void SetPeers(std::vector<ReplicationPeer> peers);

  Result<size_t> ReplicateToQuorum(const WalRecord& rec,
                                   size_t quorum_size,
                                   std::chrono::milliseconds timeout);

 private:
  int node_id_;
  std::shared_ptr<IReplicationTransport> transport_;
  std::vector<ReplicationPeer> peers_;
};

}  // namespace vaultkv
