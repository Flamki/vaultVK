#include <iostream>
#include <string>

#include "vaultkv/sstable.h"
#include "vaultkv/types.h"

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "usage: vaultkv-inspect <path-to-sstable>\n";
    return 1;
  }

  vaultkv::EngineOptions opts;
  vaultkv::AesGcm256 crypto(opts.encryption_key);
  vaultkv::SstableReader reader(argv[1], crypto);
  auto st = reader.Open();
  if (!st.ok()) {
    std::cerr << "open failed: " << st.message << "\n";
    return 1;
  }

  std::cout << "SSTable: " << argv[1] << " keys=" << reader.key_count() << "\n";
  for (const auto& rec : reader.AllRecords()) {
    std::cout << "key=" << rec.key << " seq=" << rec.seq << " tombstone=" << (rec.tombstone ? 1 : 0);
    if (!rec.tombstone) std::cout << " value=" << rec.value;
    std::cout << "\n";
  }
  return 0;
}

