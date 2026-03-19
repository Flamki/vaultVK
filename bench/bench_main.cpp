#include <chrono>
#include <iostream>
#include <string>

#include "vaultkv/storage_engine.h"

int main() {
  vaultkv::EngineOptions opts;
  opts.data_dir = "bench_data";
  opts.memtable_budget_bytes = 64 * 1024 * 1024;
  vaultkv::StorageEngine engine(opts);

  auto st = engine.Open();
  if (!st.ok()) {
    std::cerr << "engine open failed: " << st.message << "\n";
    return 1;
  }

  constexpr int kWarmup = 10000;
  constexpr int kOps = 200000;
  for (int i = 0; i < kWarmup; ++i) {
    engine.Set("warm:" + std::to_string(i), "v");
  }

  auto start = std::chrono::steady_clock::now();
  for (int i = 0; i < kOps; ++i) {
    engine.Set("k:" + std::to_string(i), std::string(64, 'x'));
  }
  auto end = std::chrono::steady_clock::now();
  auto dur_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
  double set_ops_sec = (kOps * 1000.0) / (dur_ms == 0 ? 1 : dur_ms);

  start = std::chrono::steady_clock::now();
  int hits = 0;
  for (int i = 0; i < kOps; ++i) {
    auto r = engine.Get("k:" + std::to_string(i));
    if (r.ok()) ++hits;
  }
  end = std::chrono::steady_clock::now();
  dur_ms = std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count();
  double get_ops_sec = (kOps * 1000.0) / (dur_ms == 0 ? 1 : dur_ms);

  std::cout << "VaultKV benchmark\n";
  std::cout << "SET ops/s: " << static_cast<uint64_t>(set_ops_sec) << "\n";
  std::cout << "GET ops/s: " << static_cast<uint64_t>(get_ops_sec) << " (hits=" << hits << ")\n";
  std::cout << "Duration ms: set=" << (dur_ms == 0 ? 1 : dur_ms) << "\n";
  engine.Close();
  return 0;
}

