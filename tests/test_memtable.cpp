#include "test_common.h"

#include "vaultkv/memtable.h"

void run_memtable_tests(TestSuite& t) {
  vaultkv::MemTable mt(1024 * 1024);
  auto st = mt.Set("a", "1", 1);
  EXPECT_TRUE(t, st.ok());
  st = mt.Set("ab", "2", 2);
  EXPECT_TRUE(t, st.ok());
  st = mt.Delete("a", 3);
  EXPECT_TRUE(t, st.ok());

  auto v = mt.Get("a");
  EXPECT_TRUE(t, v.ok());
  EXPECT_TRUE(t, v.value->tombstone);

  auto snap = mt.SnapshotSorted(true);
  EXPECT_EQ(t, snap.size(), static_cast<size_t>(2));
  EXPECT_EQ(t, snap[0].first, std::string("a"));
}

