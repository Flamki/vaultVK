#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>

namespace vaultkv::util {

uint32_t crc32(const uint8_t* data, size_t len);
uint64_t now_unix_nanos();
std::string format_errno(const std::string& prefix);
bool parse_hex_key(std::string_view hex, std::array<uint8_t, 32>* out);
std::string bytes_to_hex(const uint8_t* data, size_t len);

template <typename T>
inline void append_le(std::string* out, T value) {
  for (size_t i = 0; i < sizeof(T); ++i) {
    out->push_back(static_cast<char>((value >> (8 * i)) & 0xFFu));
  }
}

template <typename T>
inline T read_le(const uint8_t* in) {
  T v = 0;
  for (size_t i = 0; i < sizeof(T); ++i) {
    v |= static_cast<T>(in[i]) << (8 * i);
  }
  return v;
}

}  // namespace vaultkv::util

