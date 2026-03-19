#include "vaultkv/server.h"

#include <chrono>
#include <cstring>
#include <array>
#include <cerrno>
#include <unordered_map>
#include <vector>

#ifdef __linux__
#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

#include "vaultkv/protocol.h"

namespace vaultkv {

EpollServer::EpollServer(StorageEngine* engine, uint16_t port) : engine_(engine), port_(port) {}

Status EpollServer::Start() {
  if (engine_ == nullptr) return Status::InvalidArgument("engine is null");
  if (running_.exchange(true)) return Status::Ok();

#ifndef __linux__
  running_.store(false);
  return Status::Unsupported("epoll server is supported only on Linux");
#else
  int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
  if (listen_fd < 0) {
    running_.store(false);
    return Status::IoError("socket() failed");
  }
  int one = 1;
  setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
  fcntl(listen_fd, F_SETFL, O_NONBLOCK);

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_ANY);
  addr.sin_port = htons(port_);
  if (bind(listen_fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
    close(listen_fd);
    running_.store(false);
    return Status::IoError("bind() failed");
  }
  if (listen(listen_fd, 1024) != 0) {
    close(listen_fd);
    running_.store(false);
    return Status::IoError("listen() failed");
  }

  int epfd = epoll_create1(EPOLL_CLOEXEC);
  if (epfd < 0) {
    close(listen_fd);
    running_.store(false);
    return Status::IoError("epoll_create1 failed");
  }

  epoll_event ev{};
  ev.events = EPOLLIN | EPOLLET;
  ev.data.fd = listen_fd;
  if (epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &ev) != 0) {
    close(epfd);
    close(listen_fd);
    running_.store(false);
    return Status::IoError("epoll_ctl add listener failed");
  }

  struct Connection {
    int fd = -1;
    std::vector<uint8_t> rbuf;
    std::vector<uint8_t> wbuf;
    std::chrono::steady_clock::time_point last_activity;
  };
  std::unordered_map<int, Connection> conns;
  std::array<epoll_event, 256> events{};

  auto close_conn = [&](int fd) {
    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, nullptr);
    close(fd);
    conns.erase(fd);
  };

  while (running_.load()) {
    const int n = epoll_wait(epfd, events.data(), static_cast<int>(events.size()), 500);
    for (int i = 0; i < n; ++i) {
      const auto& e = events[i];
      const int fd = e.data.fd;

      if (fd == listen_fd) {
        while (true) {
          sockaddr_in cli{};
          socklen_t cli_len = sizeof(cli);
          int cfd = accept(listen_fd, reinterpret_cast<sockaddr*>(&cli), &cli_len);
          if (cfd < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) break;
            break;
          }
          fcntl(cfd, F_SETFL, O_NONBLOCK);
          epoll_event cev{};
          cev.events = EPOLLIN | EPOLLET | EPOLLRDHUP;
          cev.data.fd = cfd;
          epoll_ctl(epfd, EPOLL_CTL_ADD, cfd, &cev);
          conns[cfd] = Connection{cfd, {}, {}, std::chrono::steady_clock::now()};
        }
        continue;
      }

      auto it = conns.find(fd);
      if (it == conns.end()) continue;
      Connection& c = it->second;

      if ((e.events & EPOLLERR) || (e.events & EPOLLHUP) || (e.events & EPOLLRDHUP)) {
        close_conn(fd);
        continue;
      }

      if (e.events & EPOLLIN) {
        bool close_now = false;
        while (true) {
          uint8_t buf[8192];
          const ssize_t rd = recv(fd, buf, sizeof(buf), 0);
          if (rd > 0) {
            c.rbuf.insert(c.rbuf.end(), buf, buf + rd);
            c.last_activity = std::chrono::steady_clock::now();
          } else if (rd == 0) {
            close_now = true;
            break;
          } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) break;
            close_now = true;
            break;
          }
        }
        if (close_now) {
          close_conn(fd);
          continue;
        }

        std::vector<protocol::Frame> frames;
        std::string err;
        if (!protocol::Protocol::TryParseFrames(&c.rbuf, &frames, &err)) {
          auto resp = protocol::Protocol::EncodeError(400, err);
          c.wbuf.insert(c.wbuf.end(), resp.begin(), resp.end());
        } else {
          for (const auto& frame : frames) {
            auto resp = engine_->HandleFrame(frame);
            c.wbuf.insert(c.wbuf.end(), resp.begin(), resp.end());
          }
        }
      }

      if (e.events & EPOLLOUT) {
        while (!c.wbuf.empty()) {
          ssize_t wr = send(fd, c.wbuf.data(), c.wbuf.size(), 0);
          if (wr > 0) {
            c.wbuf.erase(c.wbuf.begin(), c.wbuf.begin() + wr);
            c.last_activity = std::chrono::steady_clock::now();
          } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) break;
            close_conn(fd);
            break;
          }
        }
      }

      if (conns.find(fd) != conns.end()) {
        epoll_event update{};
        update.data.fd = fd;
        update.events = EPOLLIN | EPOLLET | EPOLLRDHUP;
        if (!c.wbuf.empty()) update.events |= EPOLLOUT;
        epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &update);
      }
    }

    const auto now = std::chrono::steady_clock::now();
    for (auto it2 = conns.begin(); it2 != conns.end();) {
      const auto idle = std::chrono::duration_cast<std::chrono::seconds>(now - it2->second.last_activity).count();
      if (idle > 120) {
        const int fd = it2->first;
        ++it2;
        close_conn(fd);
      } else {
        ++it2;
      }
    }
  }

  for (const auto& kv : conns) close(kv.first);
  close(epfd);
  close(listen_fd);
  return Status::Ok();
#endif
}

Status EpollServer::Stop() {
  running_.store(false);
  return Status::Ok();
}

}  // namespace vaultkv
