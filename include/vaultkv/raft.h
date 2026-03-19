#pragma once

#include <chrono>
#include <cstdint>
#include <functional>
#include <mutex>
#include <optional>
#include <random>
#include <vector>

namespace vaultkv {

enum class RaftRole : uint8_t {
  kFollower = 0,
  kCandidate = 1,
  kLeader = 2,
};

struct RequestVote {
  uint64_t term = 0;
  int candidate_id = -1;
  uint64_t last_log_index = 0;
  uint64_t last_log_term = 0;
};

struct RequestVoteReply {
  uint64_t term = 0;
  bool vote_granted = false;
};

struct AppendEntries {
  uint64_t term = 0;
  int leader_id = -1;
};

struct RaftStateSnapshot {
  RaftRole role = RaftRole::kFollower;
  uint64_t term = 0;
  int voted_for = -1;
  int votes_received = 0;
  uint64_t last_heartbeat_ms = 0;
};

class RaftNode {
 public:
  RaftNode(int my_id, std::vector<int> peers, uint32_t random_seed = 0);

  void Tick(std::chrono::steady_clock::time_point now);

  RequestVoteReply OnRequestVote(const RequestVote& req);
  void OnRequestVoteReply(const RequestVoteReply& reply);
  void OnAppendEntries(const AppendEntries& req);

  void StartElection();

  void SetRequestVoteBroadcaster(std::function<void(const RequestVote&)> cb);
  void SetHeartbeatBroadcaster(std::function<void(const AppendEntries&)> cb);
  void SetLeaderCallback(std::function<void(uint64_t term)> cb);

  RaftStateSnapshot Snapshot() const;
  int MajorityCount() const;

 private:
  int RandomizedElectionTimeoutMs();
  void StartElectionLocked(uint64_t now_ms);

  int my_id_;
  std::vector<int> peers_;
  mutable std::mutex mu_;

  RaftRole role_ = RaftRole::kFollower;
  uint64_t term_ = 0;
  int voted_for_ = -1;
  int votes_received_ = 0;

  uint64_t last_heartbeat_ms_ = 0;
  int election_timeout_ms_ = 200;
  int heartbeat_interval_ms_ = 50;

  uint64_t my_last_log_index_ = 0;
  uint64_t my_last_log_term_ = 0;

  std::function<void(const RequestVote&)> request_vote_broadcast_;
  std::function<void(const AppendEntries&)> heartbeat_broadcast_;
  std::function<void(uint64_t)> on_become_leader_;

  mutable std::mt19937 rng_;
};

}  // namespace vaultkv

