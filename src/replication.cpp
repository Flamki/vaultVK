#include "vaultkv/replication.h"

#include <cstdint>
#include <cstring>
#include <future>
#include <string>
#include <vector>

#ifdef __linux__
#include <arpa/inet.h>
#include <netdb.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

#include "vaultkv/protocol.h"
#include "vaultkv/util.h"

namespace vaultkv {

void MemoryReplicationTransport::RegisterHandler(int node_id, Handler handler) {
  std::lock_guard<std::mutex> lock(mu_);
  handlers_[node_id] = std::move(handler);
}

bool MemoryReplicationTransport::Replicate(const WalRecord& rec,
                                           const ReplicationPeer& peer,
                                           std::chrono::milliseconds timeout) {
  Handler h;
  {
    std::lock_guard<std::mutex> lock(mu_);
    auto it = handlers_.find(peer.node_id);
    if (it == handlers_.end()) return false;
    h = it->second;
  }
  auto f = std::async(std::launch::async, [h, rec]() { return h(rec); });
  if (f.wait_for(timeout) == std::future_status::ready) {
    return f.get();
  }
  return false;
}

bool TcpReplicationTransport::Replicate(const WalRecord& rec,
                                        const ReplicationPeer& peer,
                                        std::chrono::milliseconds timeout) {
#ifndef __linux__
  (void)rec;
  (void)peer;
  (void)timeout;
  return false;
#else
  protocol::OpType op = protocol::OpType::SET;
  std::string payload;
  if (rec.op == WalOp::kSet) {
    if (rec.key.size() > UINT16_MAX || rec.value.size() > UINT32_MAX) return false;
    op = protocol::OpType::SET;
    util::append_le<uint16_t>(&payload, static_cast<uint16_t>(rec.key.size()));
    payload.append(rec.key);
    util::append_le<uint32_t>(&payload, static_cast<uint32_t>(rec.value.size()));
    payload.append(rec.value);
  } else if (rec.op == WalOp::kDelete) {
    if (rec.key.size() > UINT16_MAX) return false;
    op = protocol::OpType::DEL;
    util::append_le<uint16_t>(&payload, static_cast<uint16_t>(rec.key.size()));
    payload.append(rec.key);
  } else {
    return true;
  }
  auto frame = protocol::Protocol::EncodeFrame(op, 0, payload);

  addrinfo hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  hints.ai_protocol = IPPROTO_TCP;
  addrinfo* addrs = nullptr;
  const std::string port = std::to_string(peer.port);
  if (getaddrinfo(peer.host.c_str(), port.c_str(), &hints, &addrs) != 0) return false;

  bool ok = false;
  for (addrinfo* ai = addrs; ai != nullptr && !ok; ai = ai->ai_next) {
    int fd = socket(ai->ai_family, ai->ai_socktype, ai->ai_protocol);
    if (fd < 0) continue;

    timeval tv{};
    tv.tv_sec = static_cast<long>(timeout.count() / 1000);
    tv.tv_usec = static_cast<long>((timeout.count() % 1000) * 1000);
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    if (connect(fd, ai->ai_addr, static_cast<socklen_t>(ai->ai_addrlen)) != 0) {
      close(fd);
      continue;
    }

    size_t sent = 0;
    while (sent < frame.size()) {
      const ssize_t wr = send(fd, frame.data() + sent, frame.size() - sent, 0);
      if (wr <= 0) break;
      sent += static_cast<size_t>(wr);
    }
    if (sent != frame.size()) {
      close(fd);
      continue;
    }

    uint8_t hdr[6];
    size_t hdr_off = 0;
    while (hdr_off < sizeof(hdr)) {
      const ssize_t rd = recv(fd, hdr + hdr_off, sizeof(hdr) - hdr_off, 0);
      if (rd <= 0) break;
      hdr_off += static_cast<size_t>(rd);
    }
    if (hdr_off != sizeof(hdr)) {
      close(fd);
      continue;
    }

    const auto resp_type = static_cast<protocol::OpType>(hdr[0]);
    const uint32_t len = util::read_le<uint32_t>(hdr + 2);
    std::vector<uint8_t> resp_payload(len);
    size_t payload_off = 0;
    while (payload_off < resp_payload.size()) {
      const ssize_t rd = recv(fd, resp_payload.data() + payload_off, resp_payload.size() - payload_off, 0);
      if (rd <= 0) break;
      payload_off += static_cast<size_t>(rd);
    }
    close(fd);
    if (payload_off != resp_payload.size()) continue;
    ok = (resp_type == protocol::OpType::ACK);
  }

  freeaddrinfo(addrs);
  return ok;
#endif
}

ReplicationManager::ReplicationManager(int node_id) : node_id_(node_id) {}

void ReplicationManager::SetTransport(std::shared_ptr<IReplicationTransport> transport) {
  transport_ = std::move(transport);
}

void ReplicationManager::SetPeers(std::vector<ReplicationPeer> peers) { peers_ = std::move(peers); }

Result<size_t> ReplicationManager::ReplicateToQuorum(const WalRecord& rec,
                                                      size_t quorum_size,
                                                      std::chrono::milliseconds timeout) {
  if (quorum_size == 0) quorum_size = 1;
  size_t ack_count = 1;  // local leader append is already durable.
  if (ack_count >= quorum_size) return Result<size_t>::Ok(ack_count, rec.seq);

  if (!transport_) return Result<size_t>::Err(Status::NoQuorum("replication transport not configured"));
  if (peers_.empty()) return Result<size_t>::Err(Status::NoQuorum("no replication peers configured"));

  std::vector<std::future<bool>> futures;
  futures.reserve(peers_.size());
  for (const auto& p : peers_) {
    futures.emplace_back(std::async(std::launch::async, [this, rec, p, timeout]() {
      return transport_->Replicate(rec, p, timeout);
    }));
  }

  auto deadline = std::chrono::steady_clock::now() + timeout;
  for (auto& f : futures) {
    const auto now = std::chrono::steady_clock::now();
    if (now >= deadline) break;
    const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - now);
    if (f.wait_for(remaining) == std::future_status::ready && f.get()) {
      ++ack_count;
      if (ack_count >= quorum_size) return Result<size_t>::Ok(ack_count, rec.seq);
    }
  }

  return Result<size_t>::Err(Status::NoQuorum("quorum not reached"));
}

}  // namespace vaultkv
