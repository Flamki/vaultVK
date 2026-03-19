#pragma once

#include <atomic>
#include <cstdint>

#include "vaultkv/storage_engine.h"
#include "vaultkv/types.h"

namespace vaultkv {

class EpollServer {
 public:
  EpollServer(StorageEngine* engine, uint16_t port);

  Status Start();
  Status Stop();

 private:
  StorageEngine* engine_;
  uint16_t port_;
  std::atomic<bool> running_{false};
};

}  // namespace vaultkv

