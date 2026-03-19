#include "test_common.h"

#include "vaultkv/sstable.h"

void run_sstable_tests(TestSuite& t) {
  auto dir = make_temp_dir("sstable");
  std::array<uint8_t, 32> key{};
  key[0] = 9;
  vaultkv::AesGcm256 crypto(key);

  vaultkv::SstableBuilder b(dir / "a.sst", crypto);
  b.Add("alpha", "1", 1, false);
  b.Add("beta", "2", 2, false);
  b.Add("alpha", "3", 3, false);  // newer version should win.
  vaultkv::SstableMeta meta;
  auto st = b.Build(&meta);
  EXPECT_TRUE(t, st.ok());
  EXPECT_EQ(t, meta.key_count, static_cast<uint64_t>(2));

  vaultkv::SstableReader r(meta.path, crypto);
  st = r.Open();
  EXPECT_TRUE(t, st.ok());

  auto v = r.Get("alpha");
  EXPECT_TRUE(t, v.ok());
  EXPECT_EQ(t, v.value->value, std::string("3"));

  auto miss = r.Get("missing");
  EXPECT_TRUE(t, !miss.ok());
}

