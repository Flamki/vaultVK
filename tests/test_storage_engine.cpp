#include "test_common.h"

#include "vaultkv/storage_engine.h"

void run_storage_engine_tests(TestSuite& t) {
  auto dir = make_temp_dir("engine");
  vaultkv::EngineOptions opts;
  opts.data_dir = dir;
  opts.memtable_budget_bytes = 1024;  // force frequent flush.
  opts.wal_segment_size_bytes = 4 * 1024 * 1024;

  vaultkv::StorageEngine engine(opts);
  auto st = engine.Open();
  EXPECT_TRUE(t, st.ok());

  EXPECT_TRUE(t, engine.Set("user:1", "alice").ok());
  EXPECT_TRUE(t, engine.Set("user:2", "bob").ok());
  EXPECT_TRUE(t, engine.Delete("user:2").ok());

  auto v1 = engine.Get("user:1");
  EXPECT_TRUE(t, v1.ok());
  EXPECT_EQ(t, *v1.value, std::string("alice"));

  auto v2 = engine.Get("user:2");
  EXPECT_TRUE(t, !v2.ok());

  auto scan = engine.ScanPrefix("user:", 10);
  EXPECT_TRUE(t, scan.ok());
  EXPECT_EQ(t, scan.value->size(), static_cast<size_t>(1));
  EXPECT_EQ(t, scan.value->at(0).first, std::string("user:1"));

  EXPECT_TRUE(t, engine.FlushMemTable().ok());
  auto stats = engine.GetStats();
  EXPECT_TRUE(t, stats.wal_last_seq >= 3);
  EXPECT_TRUE(t, engine.Close().ok());
}

