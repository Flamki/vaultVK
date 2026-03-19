#include "vaultkv/compaction.h"

#include <algorithm>
#include <unordered_map>

#include "vaultkv/sstable.h"

namespace vaultkv {

CompactionManager::CompactionManager(std::filesystem::path data_dir, AesGcm256 crypto)
    : data_dir_(std::move(data_dir)), crypto_(std::move(crypto)) {}

Status CompactionManager::CompactLevel0ToLevel1(const std::vector<std::filesystem::path>& l0_tables,
                                                const std::filesystem::path& output_path) {
  if (l0_tables.empty()) return Status::InvalidArgument("no L0 tables to compact");

  std::unordered_map<std::string, SstableRecord> latest_by_key;
  for (const auto& p : l0_tables) {
    SstableReader reader(p, crypto_);
    Status st = reader.Open();
    if (!st.ok()) return st;
    for (auto& rec : reader.AllRecords()) {
      auto it = latest_by_key.find(rec.key);
      if (it == latest_by_key.end() || rec.seq > it->second.seq) {
        latest_by_key[rec.key] = std::move(rec);
      }
    }
  }

  std::vector<SstableRecord> out_records;
  out_records.reserve(latest_by_key.size());
  for (auto& kv : latest_by_key) {
    if (kv.second.tombstone) continue;
    out_records.push_back(std::move(kv.second));
  }
  if (out_records.empty()) return Status::Ok();

  std::sort(out_records.begin(), out_records.end(),
            [](const SstableRecord& a, const SstableRecord& b) { return a.key < b.key; });

  SstableBuilder builder(output_path, crypto_);
  for (const auto& rec : out_records) {
    builder.Add(rec.key, rec.value, rec.seq, rec.tombstone);
  }
  SstableMeta meta;
  return builder.Build(&meta);
}

}  // namespace vaultkv

