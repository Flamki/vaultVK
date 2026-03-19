#include "vaultkv/util.h"

#include <array>
#include <cerrno>
#include <chrono>
#include <cstring>
#include <iomanip>
#include <sstream>

namespace vaultkv::util {

uint32_t crc32(const uint8_t* data, size_t len) {
  static std::array<uint32_t, 256> table{};
  static bool init = false;
  if (!init) {
    for (uint32_t i = 0; i < 256; ++i) {
      uint32_t c = i;
      for (size_t j = 0; j < 8; ++j) {
        c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
      }
      table[i] = c;
    }
    init = true;
  }

  uint32_t c = 0xFFFFFFFFu;
  for (size_t i = 0; i < len; ++i) {
    c = table[(c ^ data[i]) & 0xFFu] ^ (c >> 8);
  }
  return c ^ 0xFFFFFFFFu;
}

uint64_t now_unix_nanos() {
  const auto now = std::chrono::system_clock::now().time_since_epoch();
  return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::nanoseconds>(now).count());
}

std::string format_errno(const std::string& prefix) {
  return prefix + ": " + std::strerror(errno);
}

static int hex_to_nibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return 10 + (c - 'a');
  if (c >= 'A' && c <= 'F') return 10 + (c - 'A');
  return -1;
}

bool parse_hex_key(std::string_view hex, std::array<uint8_t, 32>* out) {
  if (hex.size() != 64 || out == nullptr) return false;
  for (size_t i = 0; i < 32; ++i) {
    int hi = hex_to_nibble(hex[2 * i]);
    int lo = hex_to_nibble(hex[2 * i + 1]);
    if (hi < 0 || lo < 0) return false;
    (*out)[i] = static_cast<uint8_t>((hi << 4) | lo);
  }
  return true;
}

std::string bytes_to_hex(const uint8_t* data, size_t len) {
  std::ostringstream oss;
  for (size_t i = 0; i < len; ++i) {
    oss << std::hex << std::setw(2) << std::setfill('0') << static_cast<int>(data[i]);
  }
  return oss.str();
}

}  // namespace vaultkv::util

