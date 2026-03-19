#pragma once

#include <cstdint>
#include <filesystem>
#include <memory>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include "vaultkv/crypto.h"
#include "vaultkv/types.h"

namespace vaultkv {

struct SstableRecord {
  std::string key;
  std::string value;
  uint64_t seq = 0;
  bool tombstone = false;
};

struct SstableMeta {
  std::filesystem::path path;
  uint64_t key_count = 0;
  uint64_t min_seq = 0;
  uint64_t max_seq = 0;
};

class SstableBuilder {
 public:
  SstableBuilder(std::filesystem::path output_path, AesGcm256 crypto);

  void Add(std::string key, std::string value, uint64_t seq, bool tombstone);
  Status Build(SstableMeta* out_meta);

 private:
  std::filesystem::path output_path_;
  AesGcm256 crypto_;
  std::vector<SstableRecord> records_;
};

class SstableReader {
 public:
  class BloomFilter {
   public:
    BloomFilter() = default;
    BloomFilter(uint64_t bit_count, uint32_t hash_count);

    void Add(std::string_view key);
    bool MightContain(std::string_view key) const;

    const std::vector<uint8_t>& bytes() const { return bits_; }
    uint64_t bit_count() const { return bit_count_; }
    uint32_t hash_count() const { return hash_count_; }

    void set_bytes(std::vector<uint8_t> bytes) { bits_ = std::move(bytes); }

   private:
    uint64_t bit_count_ = 0;
    uint32_t hash_count_ = 0;
    std::vector<uint8_t> bits_;
  };

  SstableReader(std::filesystem::path path, AesGcm256 crypto);

  Status Open();

  Result<SstableRecord> Get(std::string_view key) const;
  std::vector<SstableRecord> ScanPrefix(std::string_view prefix, size_t limit) const;
  std::vector<SstableRecord> AllRecords() const;

  const std::filesystem::path& path() const { return path_; }
  uint64_t key_count() const { return key_count_; }

 private:
  struct IndexEntry {
    std::string key;
    uint64_t offset = 0;
  };

  Result<SstableRecord> ReadRecordAt(uint64_t offset) const;

  std::filesystem::path path_;
  AesGcm256 crypto_;
  bool open_ = false;

  uint64_t key_count_ = 0;
  uint64_t index_offset_ = 0;
  uint64_t bloom_offset_ = 0;

  std::vector<IndexEntry> index_;
  BloomFilter bloom_;
};

}  // namespace vaultkv
