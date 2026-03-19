#include "vaultkv/raft.h"

namespace vaultkv {
namespace {

uint64_t to_ms(std::chrono::steady_clock::time_point tp) {
  return static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::milliseconds>(tp.time_since_epoch()).count());
}

}  // namespace

RaftNode::RaftNode(int my_id, std::vector<int> peers, uint32_t random_seed)
    : my_id_(my_id), peers_(std::move(peers)), rng_(random_seed == 0 ? std::random_device{}() : random_seed) {
  election_timeout_ms_ = RandomizedElectionTimeoutMs();
}

void RaftNode::SetRequestVoteBroadcaster(std::function<void(const RequestVote&)> cb) {
  std::lock_guard<std::mutex> lock(mu_);
  request_vote_broadcast_ = std::move(cb);
}

void RaftNode::SetHeartbeatBroadcaster(std::function<void(const AppendEntries&)> cb) {
  std::lock_guard<std::mutex> lock(mu_);
  heartbeat_broadcast_ = std::move(cb);
}

void RaftNode::SetLeaderCallback(std::function<void(uint64_t term)> cb) {
  std::lock_guard<std::mutex> lock(mu_);
  on_become_leader_ = std::move(cb);
}

int RaftNode::RandomizedElectionTimeoutMs() {
  std::uniform_int_distribution<int> dist(150, 300);
  return dist(rng_);
}

int RaftNode::MajorityCount() const {
  return static_cast<int>((peers_.size() + 1) / 2 + 1);
}

void RaftNode::StartElectionLocked(uint64_t now_ms) {
  role_ = RaftRole::kCandidate;
  ++term_;
  voted_for_ = my_id_;
  votes_received_ = 1;
  last_heartbeat_ms_ = now_ms;
  election_timeout_ms_ = RandomizedElectionTimeoutMs();

  if (request_vote_broadcast_) {
    RequestVote rv;
    rv.term = term_;
    rv.candidate_id = my_id_;
    rv.last_log_index = my_last_log_index_;
    rv.last_log_term = my_last_log_term_;
    request_vote_broadcast_(rv);
  }
}

void RaftNode::StartElection() {
  const uint64_t now_ms = to_ms(std::chrono::steady_clock::now());
  std::lock_guard<std::mutex> lock(mu_);
  StartElectionLocked(now_ms);
}

void RaftNode::Tick(std::chrono::steady_clock::time_point now) {
  std::lock_guard<std::mutex> lock(mu_);
  const uint64_t now_ms = to_ms(now);
  const uint64_t elapsed = now_ms - last_heartbeat_ms_;
  if ((role_ == RaftRole::kFollower || role_ == RaftRole::kCandidate) &&
      elapsed > static_cast<uint64_t>(election_timeout_ms_)) {
    StartElectionLocked(now_ms);
    return;
  }

  if (role_ == RaftRole::kLeader && elapsed >= static_cast<uint64_t>(heartbeat_interval_ms_)) {
    last_heartbeat_ms_ = now_ms;
    if (heartbeat_broadcast_) {
      heartbeat_broadcast_(AppendEntries{term_, my_id_});
    }
  }
}

RequestVoteReply RaftNode::OnRequestVote(const RequestVote& req) {
  std::lock_guard<std::mutex> lock(mu_);
  RequestVoteReply rep{};
  rep.term = term_;
  rep.vote_granted = false;

  if (req.term < term_) return rep;

  if (req.term > term_) {
    term_ = req.term;
    role_ = RaftRole::kFollower;
    voted_for_ = -1;
  }

  const bool log_ok = req.last_log_term > my_last_log_term_ ||
                      (req.last_log_term == my_last_log_term_ && req.last_log_index >= my_last_log_index_);
  if ((voted_for_ == -1 || voted_for_ == req.candidate_id) && log_ok) {
    voted_for_ = req.candidate_id;
    rep.vote_granted = true;
    last_heartbeat_ms_ = to_ms(std::chrono::steady_clock::now());
  }
  rep.term = term_;
  return rep;
}

void RaftNode::OnRequestVoteReply(const RequestVoteReply& reply) {
  std::lock_guard<std::mutex> lock(mu_);
  if (role_ != RaftRole::kCandidate) return;
  if (reply.term > term_) {
    term_ = reply.term;
    role_ = RaftRole::kFollower;
    voted_for_ = -1;
    votes_received_ = 0;
    return;
  }
  if (!reply.vote_granted || reply.term != term_) return;
  ++votes_received_;
  if (votes_received_ >= MajorityCount()) {
    role_ = RaftRole::kLeader;
    last_heartbeat_ms_ = to_ms(std::chrono::steady_clock::now());
    if (on_become_leader_) on_become_leader_(term_);
  }
}

void RaftNode::OnAppendEntries(const AppendEntries& req) {
  std::lock_guard<std::mutex> lock(mu_);
  if (req.term < term_) return;
  term_ = req.term;
  role_ = RaftRole::kFollower;
  voted_for_ = req.leader_id;
  last_heartbeat_ms_ = to_ms(std::chrono::steady_clock::now());
}

RaftStateSnapshot RaftNode::Snapshot() const {
  std::lock_guard<std::mutex> lock(mu_);
  return RaftStateSnapshot{
      role_, term_, voted_for_, votes_received_, last_heartbeat_ms_,
  };
}

}  // namespace vaultkv

