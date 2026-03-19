#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace vaultkv::protocol {

enum class OpType : uint8_t {
  PING = 0x01,
  SET = 0x02,
  GET = 0x03,
  DEL = 0x04,
  SCAN = 0x05,
  ACK = 0x80,
  ERR = 0x81,
  VAL = 0x82,
  SCAN_RESULT = 0x83,
};

struct Frame {
  OpType type = OpType::ERR;
  uint8_t flags = 0;
  std::vector<uint8_t> payload;
};

struct Command {
  OpType type = OpType::ERR;
  std::string key;
  std::string value;
  std::string prefix;
  size_t limit = 100;
};

class Protocol {
 public:
  static constexpr uint32_t kMaxPayloadBytes = 4 * 1024 * 1024;
  static constexpr size_t kFrameHeaderBytes = 6;

  static std::vector<uint8_t> EncodeFrame(OpType type, uint8_t flags, std::string_view payload);
  static std::vector<uint8_t> EncodeFrame(OpType type, uint8_t flags, const std::vector<uint8_t>& payload);

  static bool TryParseFrames(std::vector<uint8_t>* read_buffer,
                             std::vector<Frame>* out_frames,
                             std::string* err);

  static bool DecodeCommand(const Frame& frame, Command* out_cmd, std::string* err);

  static std::vector<uint8_t> EncodeAck(uint64_t seq, std::string_view message);
  static std::vector<uint8_t> EncodeError(uint16_t error_code, std::string_view message);
  static std::vector<uint8_t> EncodeValue(std::string_view value);
  static std::vector<uint8_t> EncodeScanResult(const std::vector<std::pair<std::string, std::string>>& entries);

  static bool DecodeAckPayload(const std::vector<uint8_t>& payload, uint64_t* seq, std::string* message);
  static bool DecodeErrorPayload(const std::vector<uint8_t>& payload, uint16_t* code, std::string* message);
  static bool DecodeValuePayload(const std::vector<uint8_t>& payload, std::string* value);
  static bool DecodeScanResultPayload(const std::vector<uint8_t>& payload,
                                      std::vector<std::pair<std::string, std::string>>* entries,
                                      std::string* err);
};

}  // namespace vaultkv::protocol

