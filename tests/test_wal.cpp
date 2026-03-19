#include "test_common.h"

#include "vaultkv/crypto.h"
#include "vaultkv/wal.h"

void run_wal_tests(TestSuite& t) {
  auto dir = make_temp_dir("wal");
  std::array<uint8_t, 32> key{};
  key[0] = 42;
  vaultkv::Wal wal(dir / "wal.log", vaultkv::AesGcm256(key), 4 * 1024 * 1024);
  auto st = wal.Open();
  EXPECT_TRUE(t, st.ok());

  auto s1 = wal.Append(vaultkv::WalOp::kSet, "k1", "v1");
  auto s2 = wal.Append(vaultkv::WalOp::kDelete, "k2", "");
  EXPECT_TRUE(t, s1.ok());
  EXPECT_TRUE(t, s2.ok());

  std::vector<vaultkv::WalRecord> recs;
  st = wal.Replay([&](const vaultkv::WalRecord& rec) {
    recs.push_back(rec);
    return vaultkv::Status::Ok();
  });
  EXPECT_TRUE(t, st.ok());
  EXPECT_EQ(t, recs.size(), static_cast<size_t>(2));
  EXPECT_EQ(t, recs[0].key, std::string("k1"));
  EXPECT_EQ(t, recs[0].value, std::string("v1"));
  EXPECT_EQ(t, recs[1].op, vaultkv::WalOp::kDelete);
  wal.Close();
}

