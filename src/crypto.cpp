#include "vaultkv/crypto.h"

#include <algorithm>
#include <cstring>

#if VAULTKV_HAS_OPENSSL
#include <openssl/err.h>
#include <openssl/evp.h>
#include <openssl/rand.h>
#endif

#include "vaultkv/util.h"

namespace vaultkv {

AesGcm256::AesGcm256(const std::array<uint8_t, 32>& key) : key_(key) {}

void AesGcm256::set_key(const std::array<uint8_t, 32>& key) { key_ = key; }

std::optional<CipherBlob> AesGcm256::Encrypt(std::string_view plaintext, std::string_view aad) const {
  CipherBlob blob;
  blob.ciphertext.resize(plaintext.size());

#if VAULTKV_HAS_OPENSSL
  if (RAND_bytes(blob.nonce.data(), static_cast<int>(blob.nonce.size())) != 1) {
    return std::nullopt;
  }

  EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
  if (ctx == nullptr) return std::nullopt;

  int ok = EVP_EncryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr);
  ok &= EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, static_cast<int>(blob.nonce.size()), nullptr);
  ok &= EVP_EncryptInit_ex(ctx, nullptr, nullptr, key_.data(), blob.nonce.data());
  if (!ok) {
    EVP_CIPHER_CTX_free(ctx);
    return std::nullopt;
  }

  int out_len = 0;
  if (!aad.empty()) {
    ok = EVP_EncryptUpdate(ctx, nullptr, &out_len, reinterpret_cast<const unsigned char*>(aad.data()),
                           static_cast<int>(aad.size()));
    if (!ok) {
      EVP_CIPHER_CTX_free(ctx);
      return std::nullopt;
    }
  }

  if (!plaintext.empty()) {
    ok = EVP_EncryptUpdate(ctx, reinterpret_cast<unsigned char*>(blob.ciphertext.data()), &out_len,
                           reinterpret_cast<const unsigned char*>(plaintext.data()),
                           static_cast<int>(plaintext.size()));
    if (!ok) {
      EVP_CIPHER_CTX_free(ctx);
      return std::nullopt;
    }
  }

  int final_len = 0;
  ok = EVP_EncryptFinal_ex(ctx, reinterpret_cast<unsigned char*>(blob.ciphertext.data()) + out_len, &final_len);
  if (!ok) {
    EVP_CIPHER_CTX_free(ctx);
    return std::nullopt;
  }
  blob.ciphertext.resize(static_cast<size_t>(out_len + final_len));

  ok = EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_GET_TAG, static_cast<int>(blob.tag.size()), blob.tag.data());
  EVP_CIPHER_CTX_free(ctx);
  if (!ok) return std::nullopt;
#else
  // Development fallback when OpenSSL is unavailable. Not cryptographically secure.
  const uint64_t seed = util::now_unix_nanos();
  for (size_t i = 0; i < blob.nonce.size(); ++i) {
    blob.nonce[i] = static_cast<uint8_t>((seed >> ((i % 8) * 8)) ^ key_[i % key_.size()]);
  }
  for (size_t i = 0; i < plaintext.size(); ++i) {
    blob.ciphertext[i] = static_cast<uint8_t>(
        static_cast<uint8_t>(plaintext[i]) ^ key_[i % key_.size()] ^ blob.nonce[i % blob.nonce.size()]);
  }
  std::string tag_input;
  tag_input.reserve(blob.ciphertext.size() + aad.size());
  tag_input.append(reinterpret_cast<const char*>(blob.ciphertext.data()), blob.ciphertext.size());
  tag_input.append(aad.data(), aad.size());
  const uint32_t c = util::crc32(reinterpret_cast<const uint8_t*>(tag_input.data()), tag_input.size());
  for (size_t i = 0; i < blob.tag.size(); ++i) {
    blob.tag[i] = static_cast<uint8_t>((c >> ((i % 4) * 8)) ^ key_[(i + 7) % key_.size()]);
  }
#endif
  return blob;
}

bool AesGcm256::Decrypt(const CipherBlob& blob, std::string_view aad, std::string* out_plaintext) const {
  if (out_plaintext == nullptr) return false;
  out_plaintext->assign(blob.ciphertext.size(), '\0');

#if VAULTKV_HAS_OPENSSL
  EVP_CIPHER_CTX* ctx = EVP_CIPHER_CTX_new();
  if (ctx == nullptr) return false;

  int ok = EVP_DecryptInit_ex(ctx, EVP_aes_256_gcm(), nullptr, nullptr, nullptr);
  ok &= EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_IVLEN, static_cast<int>(blob.nonce.size()), nullptr);
  ok &= EVP_DecryptInit_ex(ctx, nullptr, nullptr, key_.data(), blob.nonce.data());
  if (!ok) {
    EVP_CIPHER_CTX_free(ctx);
    return false;
  }

  int out_len = 0;
  if (!aad.empty()) {
    ok = EVP_DecryptUpdate(ctx, nullptr, &out_len, reinterpret_cast<const unsigned char*>(aad.data()),
                           static_cast<int>(aad.size()));
    if (!ok) {
      EVP_CIPHER_CTX_free(ctx);
      return false;
    }
  }

  if (!blob.ciphertext.empty()) {
    ok = EVP_DecryptUpdate(ctx, reinterpret_cast<unsigned char*>(out_plaintext->data()), &out_len,
                           blob.ciphertext.data(), static_cast<int>(blob.ciphertext.size()));
    if (!ok) {
      EVP_CIPHER_CTX_free(ctx);
      return false;
    }
  }

  ok = EVP_CIPHER_CTX_ctrl(ctx, EVP_CTRL_GCM_SET_TAG, static_cast<int>(blob.tag.size()),
                           const_cast<uint8_t*>(blob.tag.data()));
  if (!ok) {
    EVP_CIPHER_CTX_free(ctx);
    return false;
  }

  int final_len = 0;
  ok = EVP_DecryptFinal_ex(ctx, reinterpret_cast<unsigned char*>(out_plaintext->data()) + out_len, &final_len);
  EVP_CIPHER_CTX_free(ctx);
  if (!ok) return false;

  out_plaintext->resize(static_cast<size_t>(out_len + final_len));
  return true;
#else
  std::string tag_input;
  tag_input.reserve(blob.ciphertext.size() + aad.size());
  tag_input.append(reinterpret_cast<const char*>(blob.ciphertext.data()), blob.ciphertext.size());
  tag_input.append(aad.data(), aad.size());
  const uint32_t c = util::crc32(reinterpret_cast<const uint8_t*>(tag_input.data()), tag_input.size());
  std::array<uint8_t, 16> expected_tag{};
  for (size_t i = 0; i < expected_tag.size(); ++i) {
    expected_tag[i] = static_cast<uint8_t>((c >> ((i % 4) * 8)) ^ key_[(i + 7) % key_.size()]);
  }
  if (!std::equal(expected_tag.begin(), expected_tag.end(), blob.tag.begin(), blob.tag.end())) {
    return false;
  }
  for (size_t i = 0; i < blob.ciphertext.size(); ++i) {
    (*out_plaintext)[i] = static_cast<char>(blob.ciphertext[i] ^ key_[i % key_.size()] ^
                                            blob.nonce[i % blob.nonce.size()]);
  }
  return true;
#endif
}

}  // namespace vaultkv
