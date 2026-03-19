#include "test_common.h"

#include "vaultkv/replication.h"

void run_replication_tests(TestSuite& t) {
  auto transport = std::make_shared<vaultkv::MemoryReplicationTransport>();
  transport->RegisterHandler(2, [](const vaultkv::WalRecord&) { return true; });
  transport->RegisterHandler(3, [](const vaultkv::WalRecord&) { return false; });

  vaultkv::ReplicationManager mgr(1);
  mgr.SetTransport(transport);
  mgr.SetPeers({
      {2, "inproc", 0},
      {3, "inproc", 0},
  });

  vaultkv::WalRecord rec;
  rec.seq = 10;
  rec.key = "k";
  rec.value = "v";

  auto q2 = mgr.ReplicateToQuorum(rec, 2, std::chrono::milliseconds(200));
  EXPECT_TRUE(t, q2.ok());

  auto q3 = mgr.ReplicateToQuorum(rec, 3, std::chrono::milliseconds(200));
  EXPECT_TRUE(t, !q3.ok());
}

