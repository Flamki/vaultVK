#include "vaultkv/sstable.h"

#include <algorithm>
#include <cstring>
#include <fstream>
#include <unordered_map>

#include "vaultkv/util.h"

namespace vaultkv {
namespace {

constexpr char kSstMagic[8] = {'V', 'K', 'S', 'S', 'T', 'B', 'L', '1'};
constexpr char kFooterMagic[8] = {'V', 'K', 'F', 'T', 'R', '0', '0', '1'};
constexpr uint16_t kSstVersion = 1;

struct Header {
  char magic[8];
  uint16_t version = 0;
  uint16_t flags = 0;
  uint64_t key_count = 0;
  uint64_t index_offset = 0;
  uint64_t bloom_offset = 0;
  uint64_t footer_offset = 0;
};

struct Footer {
  uint64_t index_offset = 0;
  uint64_t bloom_offset = 0;
  uint32_t crc = 0;
  char magic[8];
};

template <typename T>
void write_raw(std::ofstream* out, const T& v) {
  out->write(reinterpret_cast<const char*>(&v), sizeof(T));
}

template <typename T>
bool read_raw(std::ifstream* in, T* out) {
  in->read(reinterpret_cast<char*>(out), sizeof(T));
  return static_cast<bool>(*in);
}

uint64_t hash64(std::string_view s, uint64_t seed) {
  uint64_t h = seed ^ (0x9E3779B97F4A7C15ull + static_cast<uint64_t>(s.size()));
  for (char c : s) {
    h ^= static_cast<uint64_t>(static_cast<unsigned char>(c)) + 0x9E3779B97F4A7C15ull + (h << 6) + (h >> 2);
  }
  return h;
}

}  // namespace

SstableBuilder::SstableBuilder(std::filesystem::path output_path, AesGcm256 crypto)
    : output_path_(std::move(output_path)), crypto_(std::move(crypto)) {}

void SstableBuilder::Add(std::string key, std::string value, uint64_t seq, bool tombstone) {
  records_.push_back(SstableRecord{std::move(key), std::move(value), seq, tombstone});
}

Status SstableBuilder::Build(SstableMeta* out_meta) {
  if (records_.empty()) return Status::InvalidArgument("cannot build empty sstable");

  std::error_code ec;
  std::filesystem::create_directories(output_path_.parent_path(), ec);
  if (ec) return Status::IoError("failed creating sstable dir: " + ec.message());

  // Keep latest seq for duplicate keys.
  std::unordered_map<std::string, SstableRecord> latest;
  latest.reserve(records_.size());
  for (const auto& r : records_) {
    auto it = latest.find(r.key);
    if (it == latest.end() || r.seq > it->second.seq) latest[r.key] = r;
  }

  std::vector<SstableRecord> sorted;
  sorted.reserve(latest.size());
  for (auto& kv : latest) sorted.push_back(std::move(kv.second));
  std::sort(sorted.begin(), sorted.end(), [](const auto& a, const auto& b) { return a.key < b.key; });

  std::ofstream out(output_path_, std::ios::binary | std::ios::trunc);
  if (!out) return Status::IoError("failed opening sstable file for write");

  Header hdr{};
  std::memcpy(hdr.magic, kSstMagic, sizeof(kSstMagic));
  hdr.version = kSstVersion;
  hdr.flags = 0;
  hdr.key_count = sorted.size();
  write_raw(&out, hdr);  // placeholder with unresolved offsets.

  std::vector<std::pair<std::string, uint64_t>> index_entries;
  index_entries.reserve(sorted.size());

  uint64_t min_seq = UINT64_MAX;
  uint64_t max_seq = 0;
  for (const auto& r : sorted) {
    if (r.key.size() > UINT16_MAX) return Status::InvalidArgument("key too large for sstable");
    if (r.value.size() > UINT32_MAX) return Status::InvalidArgument("value too large for sstable");

    auto cipher = crypto_.Encrypt(r.value);
    if (!cipher) return Status::CryptoError("sstable encryption failed");

    const uint16_t key_len = static_cast<uint16_t>(r.key.size());
    const uint32_t val_len = static_cast<uint32_t>(r.value.size());
    const uint64_t offset = static_cast<uint64_t>(out.tellp());
    index_entries.emplace_back(r.key, offset);

    write_raw(&out, key_len);
    write_raw(&out, val_len);
    write_raw(&out, r.seq);
    uint8_t tomb = static_cast<uint8_t>(r.tombstone ? 1 : 0);
    write_raw(&out, tomb);
    uint32_t cipher_len = static_cast<uint32_t>(cipher->ciphertext.size());
    write_raw(&out, cipher_len);
    out.write(reinterpret_cast<const char*>(cipher->nonce.data()), cipher->nonce.size());
    out.write(reinterpret_cast<const char*>(cipher->tag.data()), cipher->tag.size());
    out.write(r.key.data(), static_cast<std::streamsize>(r.key.size()));
    out.write(reinterpret_cast<const char*>(cipher->ciphertext.data()),
              static_cast<std::streamsize>(cipher->ciphertext.size()));
    if (!out) return Status::IoError("failed writing sstable record");

    min_seq = std::min(min_seq, r.seq);
    max_seq = std::max(max_seq, r.seq);
  }

  const uint64_t index_offset = static_cast<uint64_t>(out.tellp());
  const uint64_t count = index_entries.size();
  write_raw(&out, count);
  for (const auto& [key, off] : index_entries) {
    const uint16_t len = static_cast<uint16_t>(key.size());
    write_raw(&out, len);
    out.write(key.data(), len);
    write_raw(&out, off);
  }
  if (!out) return Status::IoError("failed writing sstable index");

  const uint64_t bloom_offset = static_cast<uint64_t>(out.tellp());
  SstableReader::BloomFilter bloom(std::max<uint64_t>(64, sorted.size() * 10), 7);
  for (const auto& [key, _] : index_entries) bloom.Add(key);
  const uint64_t bloom_bits = bloom.bit_count();
  const uint32_t bloom_hashes = bloom.hash_count();
  const uint64_t bloom_bytes_len = bloom.bytes().size();
  write_raw(&out, bloom_bits);
  write_raw(&out, bloom_hashes);
  write_raw(&out, bloom_bytes_len);
  out.write(reinterpret_cast<const char*>(bloom.bytes().data()), static_cast<std::streamsize>(bloom.bytes().size()));
  if (!out) return Status::IoError("failed writing bloom filter");

  const uint64_t footer_offset = static_cast<uint64_t>(out.tellp());
  Footer f{};
  f.index_offset = index_offset;
  f.bloom_offset = bloom_offset;
  std::memcpy(f.magic, kFooterMagic, sizeof(kFooterMagic));
  std::string crc_bytes;
  util::append_le<uint64_t>(&crc_bytes, f.index_offset);
  util::append_le<uint64_t>(&crc_bytes, f.bloom_offset);
  f.crc = util::crc32(reinterpret_cast<const uint8_t*>(crc_bytes.data()), crc_bytes.size());
  write_raw(&out, f);

  hdr.index_offset = index_offset;
  hdr.bloom_offset = bloom_offset;
  hdr.footer_offset = footer_offset;
  out.seekp(0, std::ios::beg);
  write_raw(&out, hdr);
  out.close();
  if (!out) return Status::IoError("failed finalizing sstable");

  if (out_meta) {
    out_meta->path = output_path_;
    out_meta->key_count = sorted.size();
    out_meta->min_seq = min_seq == UINT64_MAX ? 0 : min_seq;
    out_meta->max_seq = max_seq;
  }
  return Status::Ok();
}

SstableReader::BloomFilter::BloomFilter(uint64_t bit_count, uint32_t hash_count)
    : bit_count_(bit_count), hash_count_(hash_count), bits_((bit_count + 7) / 8, 0) {}

void SstableReader::BloomFilter::Add(std::string_view key) {
  if (bit_count_ == 0 || hash_count_ == 0) return;
  for (uint32_t i = 0; i < hash_count_; ++i) {
    const uint64_t h = hash64(key, 0x9e3779b97f4a7c15ULL + i * 0x100000001b3ULL);
    const uint64_t bit = h % bit_count_;
    bits_[bit / 8] = static_cast<uint8_t>(bits_[bit / 8] | (1u << (bit % 8)));
  }
}

bool SstableReader::BloomFilter::MightContain(std::string_view key) const {
  if (bit_count_ == 0 || hash_count_ == 0) return true;
  for (uint32_t i = 0; i < hash_count_; ++i) {
    const uint64_t h = hash64(key, 0x9e3779b97f4a7c15ULL + i * 0x100000001b3ULL);
    const uint64_t bit = h % bit_count_;
    if ((bits_[bit / 8] & (1u << (bit % 8))) == 0) return false;
  }
  return true;
}

SstableReader::SstableReader(std::filesystem::path path, AesGcm256 crypto)
    : path_(std::move(path)), crypto_(std::move(crypto)) {}

Status SstableReader::Open() {
  std::ifstream in(path_, std::ios::binary);
  if (!in) return Status::IoError("failed opening sstable for read");

  Header hdr{};
  if (!read_raw(&in, &hdr)) return Status::Corruption("failed reading sstable header");
  if (std::memcmp(hdr.magic, kSstMagic, sizeof(kSstMagic)) != 0) {
    return Status::Corruption("bad sstable magic");
  }
  if (hdr.version != kSstVersion) return Status::Corruption("unsupported sstable version");

  key_count_ = hdr.key_count;
  index_offset_ = hdr.index_offset;
  bloom_offset_ = hdr.bloom_offset;

  in.seekg(static_cast<std::streamoff>(index_offset_), std::ios::beg);
  uint64_t index_count = 0;
  if (!read_raw(&in, &index_count)) return Status::Corruption("failed reading index count");

  index_.clear();
  index_.reserve(index_count);
  for (uint64_t i = 0; i < index_count; ++i) {
    uint16_t key_len = 0;
    uint64_t off = 0;
    if (!read_raw(&in, &key_len)) return Status::Corruption("failed reading index key len");
    std::string key;
    key.resize(key_len);
    in.read(key.data(), key_len);
    if (!in) return Status::Corruption("failed reading index key");
    if (!read_raw(&in, &off)) return Status::Corruption("failed reading index offset");
    index_.push_back(IndexEntry{std::move(key), off});
  }

  in.seekg(static_cast<std::streamoff>(bloom_offset_), std::ios::beg);
  uint64_t bit_count = 0;
  uint32_t hash_count = 0;
  uint64_t byte_len = 0;
  if (!read_raw(&in, &bit_count) || !read_raw(&in, &hash_count) || !read_raw(&in, &byte_len)) {
    return Status::Corruption("failed reading bloom header");
  }
  BloomFilter bloom(bit_count, hash_count);
  std::vector<uint8_t> bytes(byte_len, 0);
  in.read(reinterpret_cast<char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
  if (!in) return Status::Corruption("failed reading bloom payload");
  bloom.set_bytes(std::move(bytes));
  bloom_ = std::move(bloom);

  open_ = true;
  return Status::Ok();
}

Result<SstableRecord> SstableReader::ReadRecordAt(uint64_t offset) const {
  std::ifstream in(path_, std::ios::binary);
  if (!in) return Result<SstableRecord>::Err(Status::IoError("failed opening sstable for read"));
  in.seekg(static_cast<std::streamoff>(offset), std::ios::beg);

  uint16_t key_len = 0;
  uint32_t val_len = 0;
  uint64_t seq = 0;
  uint8_t tomb = 0;
  uint32_t cipher_len = 0;
  std::array<uint8_t, 12> nonce{};
  std::array<uint8_t, 16> tag{};

  if (!read_raw(&in, &key_len) || !read_raw(&in, &val_len) || !read_raw(&in, &seq) || !read_raw(&in, &tomb) ||
      !read_raw(&in, &cipher_len)) {
    return Result<SstableRecord>::Err(Status::Corruption("record header read failed"));
  }
  in.read(reinterpret_cast<char*>(nonce.data()), nonce.size());
  in.read(reinterpret_cast<char*>(tag.data()), tag.size());
  if (!in) return Result<SstableRecord>::Err(Status::Corruption("record nonce/tag read failed"));

  std::string key;
  key.resize(key_len);
  in.read(key.data(), key_len);
  if (!in) return Result<SstableRecord>::Err(Status::Corruption("record key read failed"));

  std::vector<uint8_t> cipher(cipher_len, 0);
  in.read(reinterpret_cast<char*>(cipher.data()), static_cast<std::streamsize>(cipher.size()));
  if (!in) return Result<SstableRecord>::Err(Status::Corruption("record cipher read failed"));

  CipherBlob blob;
  blob.nonce = nonce;
  blob.tag = tag;
  blob.ciphertext = std::move(cipher);
  std::string value;
  if (!crypto_.Decrypt(blob, "", &value)) {
    return Result<SstableRecord>::Err(Status::Corruption("record decrypt failed"));
  }
  if (value.size() != val_len) {
    return Result<SstableRecord>::Err(Status::Corruption("record value length mismatch"));
  }

  SstableRecord rec;
  rec.key = std::move(key);
  rec.value = std::move(value);
  rec.seq = seq;
  rec.tombstone = tomb != 0;
  return Result<SstableRecord>::Ok(std::move(rec), seq);
}

Result<SstableRecord> SstableReader::Get(std::string_view key) const {
  if (!open_) return Result<SstableRecord>::Err(Status::IoError("sstable not opened"));
  if (!bloom_.MightContain(key)) return Result<SstableRecord>::Err(Status::NotFound("bloom miss"));

  auto it = std::lower_bound(index_.begin(), index_.end(), key, [](const IndexEntry& e, std::string_view k) {
    return e.key < k;
  });
  if (it == index_.end() || it->key != key) return Result<SstableRecord>::Err(Status::NotFound("key not found"));
  return ReadRecordAt(it->offset);
}

std::vector<SstableRecord> SstableReader::ScanPrefix(std::string_view prefix, size_t limit) const {
  std::vector<SstableRecord> out;
  if (!open_) return out;
  auto it = std::lower_bound(index_.begin(), index_.end(), prefix, [](const IndexEntry& e, std::string_view k) {
    return e.key < k;
  });
  while (it != index_.end() && out.size() < limit) {
    if (it->key.compare(0, prefix.size(), prefix) != 0) break;
    auto rec = ReadRecordAt(it->offset);
    if (rec.ok()) out.push_back(*rec.value);
    ++it;
  }
  return out;
}

std::vector<SstableRecord> SstableReader::AllRecords() const {
  std::vector<SstableRecord> out;
  out.reserve(index_.size());
  for (const auto& idx : index_) {
    auto rec = ReadRecordAt(idx.offset);
    if (rec.ok()) out.push_back(*rec.value);
  }
  return out;
}

}  // namespace vaultkv

