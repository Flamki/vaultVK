#pragma once

#include <filesystem>
#include <vector>

#include "vaultkv/crypto.h"
#include "vaultkv/types.h"

namespace vaultkv {

class CompactionManager {
 public:
  CompactionManager(std::filesystem::path data_dir, AesGcm256 crypto);

  Status CompactLevel0ToLevel1(const std::vector<std::filesystem::path>& l0_tables,
                               const std::filesystem::path& output_path);

 private:
  std::filesystem::path data_dir_;
  AesGcm256 crypto_;
};

}  // namespace vaultkv

