#include "test_common.h"

#include "vaultkv/compaction.h"
#include "vaultkv/sstable.h"

void run_compaction_tests(TestSuite& t) {
  auto dir = make_temp_dir("compact");
  std::array<uint8_t, 32> key{};
  key[0] = 7;
  vaultkv::AesGcm256 crypto(key);

  const auto l0a = dir / "l0-a.sst";
  const auto l0b = dir / "l0-b.sst";

  {
    vaultkv::SstableBuilder b(l0a, crypto);
    b.Add("k", "v1", 1, false);
    b.Add("x", "x1", 2, false);
    vaultkv::SstableMeta m;
    EXPECT_TRUE(t, b.Build(&m).ok());
  }
  {
    vaultkv::SstableBuilder b(l0b, crypto);
    b.Add("k", "v2", 3, false);
    b.Add("x", "", 4, true);
    vaultkv::SstableMeta m;
    EXPECT_TRUE(t, b.Build(&m).ok());
  }

  vaultkv::CompactionManager cm(dir, crypto);
  const auto out = dir / "l1-out.sst";
  auto st = cm.CompactLevel0ToLevel1({l0a, l0b}, out);
  EXPECT_TRUE(t, st.ok());

  vaultkv::SstableReader r(out, crypto);
  EXPECT_TRUE(t, r.Open().ok());
  auto k = r.Get("k");
  EXPECT_TRUE(t, k.ok());
  EXPECT_EQ(t, k.value->value, std::string("v2"));
  auto x = r.Get("x");
  EXPECT_TRUE(t, !x.ok());
}

