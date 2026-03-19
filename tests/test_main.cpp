#include "test_common.h"

void run_protocol_tests(TestSuite& t);
void run_wal_tests(TestSuite& t);
void run_memtable_tests(TestSuite& t);
void run_sstable_tests(TestSuite& t);
void run_compaction_tests(TestSuite& t);
void run_replication_tests(TestSuite& t);
void run_storage_engine_tests(TestSuite& t);

int main() {
  TestSuite t;
  run_protocol_tests(t);
  run_wal_tests(t);
  run_memtable_tests(t);
  run_sstable_tests(t);
  run_compaction_tests(t);
  run_replication_tests(t);
  run_storage_engine_tests(t);

  if (t.failed == 0) {
    std::cout << "all tests passed\n";
    return 0;
  }
  std::cerr << t.failed << " test assertion(s) failed\n";
  return 1;
}

