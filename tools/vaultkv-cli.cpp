#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#ifdef __linux__
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>
#endif

#include "vaultkv/protocol.h"
#include "vaultkv/util.h"

namespace {

#ifdef __linux__
std::vector<uint8_t> make_set_payload(const std::string& key, const std::string& value) {
  std::string payload;
  vaultkv::util::append_le<uint16_t>(&payload, static_cast<uint16_t>(key.size()));
  payload.append(key);
  vaultkv::util::append_le<uint32_t>(&payload, static_cast<uint32_t>(value.size()));
  payload.append(value);
  return vaultkv::protocol::Protocol::EncodeFrame(vaultkv::protocol::OpType::SET, 0, payload);
}

std::vector<uint8_t> make_key_payload_frame(vaultkv::protocol::OpType type, const std::string& key) {
  std::string payload;
  vaultkv::util::append_le<uint16_t>(&payload, static_cast<uint16_t>(key.size()));
  payload.append(key);
  return vaultkv::protocol::Protocol::EncodeFrame(type, 0, payload);
}

std::vector<uint8_t> make_scan_payload(const std::string& prefix, uint16_t limit) {
  std::string payload;
  vaultkv::util::append_le<uint16_t>(&payload, static_cast<uint16_t>(prefix.size()));
  payload.append(prefix);
  vaultkv::util::append_le<uint16_t>(&payload, limit);
  return vaultkv::protocol::Protocol::EncodeFrame(vaultkv::protocol::OpType::SCAN, 0, payload);
}

bool read_exact(int fd, void* out, size_t len) {
  uint8_t* p = static_cast<uint8_t*>(out);
  size_t off = 0;
  while (off < len) {
    const ssize_t rd = recv(fd, p + off, len - off, 0);
    if (rd <= 0) return false;
    off += static_cast<size_t>(rd);
  }
  return true;
}

bool write_all(int fd, const std::vector<uint8_t>& bytes) {
  size_t off = 0;
  while (off < bytes.size()) {
    const ssize_t wr = send(fd, bytes.data() + off, bytes.size() - off, 0);
    if (wr <= 0) return false;
    off += static_cast<size_t>(wr);
  }
  return true;
}
#endif

}  // namespace

int main(int argc, char** argv) {
#ifndef __linux__
  std::cerr << "vaultkv-cli is currently supported only on Linux\n";
  return 1;
#else
  std::string host = "127.0.0.1";
  uint16_t port = 7379;
  if (argc >= 2) host = argv[1];
  if (argc >= 3) port = static_cast<uint16_t>(std::stoi(argv[2]));

  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) {
    std::cerr << "socket failed\n";
    return 1;
  }

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(port);
  if (inet_pton(AF_INET, host.c_str(), &addr.sin_addr) != 1) {
    std::cerr << "invalid host\n";
    close(fd);
    return 1;
  }
  if (connect(fd, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
    std::cerr << "connect failed\n";
    close(fd);
    return 1;
  }

  std::cout << "connected to " << host << ":" << port << "\n";
  std::cout << "commands: PING | SET <k> <v> | GET <k> | DEL <k> | SCAN <prefix> [limit] | QUIT\n";

  std::string line;
  while (std::cout << "> " && std::getline(std::cin, line)) {
    if (line.empty()) continue;
    if (line == "QUIT" || line == "quit" || line == "exit") break;

    std::istringstream iss(line);
    std::string cmd;
    iss >> cmd;

    std::vector<uint8_t> req;
    if (cmd == "PING" || cmd == "ping") {
      req = vaultkv::protocol::Protocol::EncodeFrame(vaultkv::protocol::OpType::PING, 0, "");
    } else if (cmd == "SET" || cmd == "set") {
      std::string k, v;
      iss >> k;
      std::getline(iss, v);
      if (!v.empty() && v[0] == ' ') v.erase(v.begin());
      req = make_set_payload(k, v);
    } else if (cmd == "GET" || cmd == "get") {
      std::string k;
      iss >> k;
      req = make_key_payload_frame(vaultkv::protocol::OpType::GET, k);
    } else if (cmd == "DEL" || cmd == "del") {
      std::string k;
      iss >> k;
      req = make_key_payload_frame(vaultkv::protocol::OpType::DEL, k);
    } else if (cmd == "SCAN" || cmd == "scan") {
      std::string prefix;
      int limit = 20;
      iss >> prefix >> limit;
      req = make_scan_payload(prefix, static_cast<uint16_t>(std::max(1, limit)));
    } else {
      std::cout << "unknown command\n";
      continue;
    }

    if (!write_all(fd, req)) {
      std::cerr << "send failed\n";
      break;
    }

    uint8_t hdr[6];
    if (!read_exact(fd, hdr, sizeof(hdr))) {
      std::cerr << "read header failed\n";
      break;
    }
    vaultkv::protocol::Frame resp;
    resp.type = static_cast<vaultkv::protocol::OpType>(hdr[0]);
    resp.flags = hdr[1];
    const uint32_t len = vaultkv::util::read_le<uint32_t>(hdr + 2);
    resp.payload.resize(len);
    if (len > 0 && !read_exact(fd, resp.payload.data(), len)) {
      std::cerr << "read payload failed\n";
      break;
    }

    if (resp.type == vaultkv::protocol::OpType::ACK) {
      uint64_t seq = 0;
      std::string msg;
      if (vaultkv::protocol::Protocol::DecodeAckPayload(resp.payload, &seq, &msg)) {
        std::cout << "ACK seq=" << seq << " msg=" << msg << "\n";
      }
    } else if (resp.type == vaultkv::protocol::OpType::ERR) {
      uint16_t code = 0;
      std::string msg;
      if (vaultkv::protocol::Protocol::DecodeErrorPayload(resp.payload, &code, &msg)) {
        std::cout << "ERR code=" << code << " msg=" << msg << "\n";
      }
    } else if (resp.type == vaultkv::protocol::OpType::VAL) {
      std::string value;
      if (vaultkv::protocol::Protocol::DecodeValuePayload(resp.payload, &value)) {
        std::cout << value << "\n";
      }
    } else if (resp.type == vaultkv::protocol::OpType::SCAN_RESULT) {
      std::vector<std::pair<std::string, std::string>> entries;
      std::string err;
      if (vaultkv::protocol::Protocol::DecodeScanResultPayload(resp.payload, &entries, &err)) {
        for (const auto& [k, v] : entries) {
          std::cout << k << " => " << v << "\n";
        }
      } else {
        std::cout << "scan decode error: " << err << "\n";
      }
    }
  }

  close(fd);
  return 0;
#endif
}
