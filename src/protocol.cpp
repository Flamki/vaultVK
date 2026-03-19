#include "vaultkv/protocol.h"

#include <cstring>

#include "vaultkv/util.h"

namespace vaultkv::protocol {
namespace {

std::string read_bytes(const std::vector<uint8_t>& payload, size_t offset, size_t len) {
  return std::string(reinterpret_cast<const char*>(payload.data() + offset), len);
}

}  // namespace

std::vector<uint8_t> Protocol::EncodeFrame(OpType type, uint8_t flags, std::string_view payload) {
  std::vector<uint8_t> out;
  out.reserve(kFrameHeaderBytes + payload.size());
  out.push_back(static_cast<uint8_t>(type));
  out.push_back(flags);
  std::string len_bytes;
  util::append_le<uint32_t>(&len_bytes, static_cast<uint32_t>(payload.size()));
  out.insert(out.end(), len_bytes.begin(), len_bytes.end());
  out.insert(out.end(), payload.begin(), payload.end());
  return out;
}

std::vector<uint8_t> Protocol::EncodeFrame(OpType type, uint8_t flags, const std::vector<uint8_t>& payload) {
  return EncodeFrame(type, flags,
                     std::string_view(reinterpret_cast<const char*>(payload.data()), payload.size()));
}

bool Protocol::TryParseFrames(std::vector<uint8_t>* read_buffer,
                              std::vector<Frame>* out_frames,
                              std::string* err) {
  if (read_buffer == nullptr || out_frames == nullptr) {
    if (err) *err = "null parser arg";
    return false;
  }

  size_t offset = 0;
  while (read_buffer->size() >= offset + kFrameHeaderBytes) {
    const uint8_t* p = read_buffer->data() + offset;
    const OpType type = static_cast<OpType>(p[0]);
    const uint8_t flags = p[1];
    const uint32_t length = util::read_le<uint32_t>(p + 2);
    if (length > kMaxPayloadBytes) {
      if (err) *err = "payload too large";
      return false;
    }

    const size_t frame_bytes = kFrameHeaderBytes + static_cast<size_t>(length);
    if (read_buffer->size() < offset + frame_bytes) break;

    Frame frame;
    frame.type = type;
    frame.flags = flags;
    frame.payload.assign(read_buffer->begin() + static_cast<long long>(offset + kFrameHeaderBytes),
                         read_buffer->begin() + static_cast<long long>(offset + frame_bytes));
    out_frames->push_back(std::move(frame));
    offset += frame_bytes;
  }

  if (offset > 0) {
    read_buffer->erase(read_buffer->begin(), read_buffer->begin() + static_cast<long long>(offset));
  }
  return true;
}

bool Protocol::DecodeCommand(const Frame& frame, Command* out_cmd, std::string* err) {
  if (out_cmd == nullptr) {
    if (err) *err = "out_cmd is null";
    return false;
  }
  Command cmd{};
  cmd.type = frame.type;
  const auto& p = frame.payload;

  switch (frame.type) {
    case OpType::PING:
      *out_cmd = std::move(cmd);
      return true;

    case OpType::SET: {
      if (p.size() < 2 + 4) {
        if (err) *err = "SET payload too short";
        return false;
      }
      const uint16_t key_len = util::read_le<uint16_t>(p.data());
      if (p.size() < static_cast<size_t>(2 + key_len + 4)) {
        if (err) *err = "SET key truncated";
        return false;
      }
      const size_t val_len_offset = 2 + key_len;
      const uint32_t val_len = util::read_le<uint32_t>(p.data() + val_len_offset);
      const size_t expect = val_len_offset + 4 + static_cast<size_t>(val_len);
      if (p.size() != expect) {
        if (err) *err = "SET payload length mismatch";
        return false;
      }
      cmd.key = read_bytes(p, 2, key_len);
      cmd.value = read_bytes(p, val_len_offset + 4, val_len);
      *out_cmd = std::move(cmd);
      return true;
    }

    case OpType::GET:
    case OpType::DEL: {
      if (p.size() < 2) {
        if (err) *err = "GET/DEL payload too short";
        return false;
      }
      const uint16_t key_len = util::read_le<uint16_t>(p.data());
      if (p.size() != static_cast<size_t>(2 + key_len)) {
        if (err) *err = "GET/DEL key length mismatch";
        return false;
      }
      cmd.key = read_bytes(p, 2, key_len);
      *out_cmd = std::move(cmd);
      return true;
    }

    case OpType::SCAN: {
      if (p.size() < 2 + 2) {
        if (err) *err = "SCAN payload too short";
        return false;
      }
      const uint16_t prefix_len = util::read_le<uint16_t>(p.data());
      if (p.size() < static_cast<size_t>(2 + prefix_len + 2)) {
        if (err) *err = "SCAN prefix truncated";
        return false;
      }
      cmd.prefix = read_bytes(p, 2, prefix_len);
      cmd.limit = util::read_le<uint16_t>(p.data() + 2 + prefix_len);
      if (cmd.limit == 0) cmd.limit = 100;
      *out_cmd = std::move(cmd);
      return true;
    }

    default:
      if (err) *err = "unsupported request opcode";
      return false;
  }
}

std::vector<uint8_t> Protocol::EncodeAck(uint64_t seq, std::string_view message) {
  std::string payload;
  payload.reserve(8 + 2 + message.size());
  util::append_le<uint64_t>(&payload, seq);
  util::append_le<uint16_t>(&payload, static_cast<uint16_t>(message.size()));
  payload.append(message.data(), message.size());
  return EncodeFrame(OpType::ACK, 0, payload);
}

std::vector<uint8_t> Protocol::EncodeError(uint16_t error_code, std::string_view message) {
  std::string payload;
  payload.reserve(2 + 2 + message.size());
  util::append_le<uint16_t>(&payload, error_code);
  util::append_le<uint16_t>(&payload, static_cast<uint16_t>(message.size()));
  payload.append(message.data(), message.size());
  return EncodeFrame(OpType::ERR, 0, payload);
}

std::vector<uint8_t> Protocol::EncodeValue(std::string_view value) {
  std::string payload;
  payload.reserve(4 + value.size());
  util::append_le<uint32_t>(&payload, static_cast<uint32_t>(value.size()));
  payload.append(value.data(), value.size());
  return EncodeFrame(OpType::VAL, 0, payload);
}

std::vector<uint8_t> Protocol::EncodeScanResult(
    const std::vector<std::pair<std::string, std::string>>& entries) {
  std::string payload;
  util::append_le<uint16_t>(&payload, static_cast<uint16_t>(entries.size()));
  for (const auto& [key, value] : entries) {
    util::append_le<uint16_t>(&payload, static_cast<uint16_t>(key.size()));
    payload.append(key);
    util::append_le<uint32_t>(&payload, static_cast<uint32_t>(value.size()));
    payload.append(value);
  }
  return EncodeFrame(OpType::SCAN_RESULT, 0, payload);
}

bool Protocol::DecodeAckPayload(const std::vector<uint8_t>& payload, uint64_t* seq, std::string* message) {
  if (payload.size() < 8 + 2) return false;
  const uint64_t s = util::read_le<uint64_t>(payload.data());
  const uint16_t len = util::read_le<uint16_t>(payload.data() + 8);
  if (payload.size() != static_cast<size_t>(10 + len)) return false;
  if (seq) *seq = s;
  if (message) *message = read_bytes(payload, 10, len);
  return true;
}

bool Protocol::DecodeErrorPayload(const std::vector<uint8_t>& payload, uint16_t* code, std::string* message) {
  if (payload.size() < 2 + 2) return false;
  const uint16_t c = util::read_le<uint16_t>(payload.data());
  const uint16_t len = util::read_le<uint16_t>(payload.data() + 2);
  if (payload.size() != static_cast<size_t>(4 + len)) return false;
  if (code) *code = c;
  if (message) *message = read_bytes(payload, 4, len);
  return true;
}

bool Protocol::DecodeValuePayload(const std::vector<uint8_t>& payload, std::string* value) {
  if (payload.size() < 4) return false;
  const uint32_t len = util::read_le<uint32_t>(payload.data());
  if (payload.size() != static_cast<size_t>(4 + len)) return false;
  if (value) *value = read_bytes(payload, 4, len);
  return true;
}

bool Protocol::DecodeScanResultPayload(const std::vector<uint8_t>& payload,
                                       std::vector<std::pair<std::string, std::string>>* entries,
                                       std::string* err) {
  if (entries == nullptr) {
    if (err) *err = "entries is null";
    return false;
  }
  entries->clear();
  if (payload.size() < 2) {
    if (err) *err = "scan payload too short";
    return false;
  }
  size_t off = 0;
  const uint16_t n = util::read_le<uint16_t>(payload.data() + off);
  off += 2;
  for (uint16_t i = 0; i < n; ++i) {
    if (off + 2 > payload.size()) {
      if (err) *err = "scan key len truncated";
      return false;
    }
    const uint16_t key_len = util::read_le<uint16_t>(payload.data() + off);
    off += 2;
    if (off + key_len + 4 > payload.size()) {
      if (err) *err = "scan key/value truncated";
      return false;
    }
    std::string key = read_bytes(payload, off, key_len);
    off += key_len;
    const uint32_t value_len = util::read_le<uint32_t>(payload.data() + off);
    off += 4;
    if (off + value_len > payload.size()) {
      if (err) *err = "scan value truncated";
      return false;
    }
    std::string value = read_bytes(payload, off, value_len);
    off += value_len;
    entries->emplace_back(std::move(key), std::move(value));
  }
  if (off != payload.size()) {
    if (err) *err = "scan payload trailing bytes";
    return false;
  }
  return true;
}

}  // namespace vaultkv::protocol

