#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace vaultkv {

struct CipherBlob {
  std::array<uint8_t, 12> nonce{};
  std::array<uint8_t, 16> tag{};
  std::vector<uint8_t> ciphertext;
};

class AesGcm256 {
 public:
  explicit AesGcm256(const std::array<uint8_t, 32>& key);

  void set_key(const std::array<uint8_t, 32>& key);
  const std::array<uint8_t, 32>& key() const { return key_; }

  std::optional<CipherBlob> Encrypt(std::string_view plaintext, std::string_view aad = "") const;
  bool Decrypt(const CipherBlob& blob, std::string_view aad, std::string* out_plaintext) const;

 private:
  std::array<uint8_t, 32> key_{};
};

}  // namespace vaultkv

