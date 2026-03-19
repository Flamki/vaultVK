#include <csignal>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <optional>
#include <string>
#include <vector>

#include "vaultkv/replication.h"
#include "vaultkv/server.h"
#include "vaultkv/storage_engine.h"
#include "vaultkv/util.h"

namespace {

vaultkv::EpollServer* g_server = nullptr;

void on_signal(int) {
  if (g_server != nullptr) {
    g_server->Stop();
  }
}

struct StartupConfig {
  vaultkv::EngineOptions engine_options;
  std::vector<vaultkv::ReplicationPeer> peers;
};

std::optional<std::string> getenv_string(const char* name) {
#ifdef _WIN32
  char* value = nullptr;
  size_t len = 0;
  if (_dupenv_s(&value, &len, name) != 0 || value == nullptr) return std::nullopt;
  std::string out(value);
  free(value);
  return out;
#else
  const char* v = std::getenv(name);
  if (v == nullptr) return std::nullopt;
  return std::string(v);
#endif
}

bool parse_peer(const std::string& spec, int default_id, vaultkv::ReplicationPeer* out_peer) {
  if (out_peer == nullptr) return false;
  int node_id = default_id;
  std::string host_port = spec;
  const size_t at = spec.find('@');
  if (at != std::string::npos) {
    try {
      node_id = std::stoi(spec.substr(0, at));
      host_port = spec.substr(at + 1);
    } catch (...) {
      return false;
    }
  }
  const size_t colon = host_port.rfind(':');
  if (colon == std::string::npos || colon == 0 || colon + 1 >= host_port.size()) return false;
  const std::string host = host_port.substr(0, colon);
  int port = 0;
  try {
    port = std::stoi(host_port.substr(colon + 1));
  } catch (...) {
    return false;
  }
  if (port <= 0 || port > 65535) return false;
  out_peer->node_id = node_id;
  out_peer->host = host;
  out_peer->port = static_cast<uint16_t>(port);
  return true;
}

StartupConfig parse_options(int argc, char** argv) {
  StartupConfig cfg;
  auto& opts = cfg.engine_options;
  const auto key_env = getenv_string("VAULTKV_KEY_HEX");
  if (key_env && !vaultkv::util::parse_hex_key(*key_env, &opts.encryption_key)) {
    std::cerr << "warning: invalid VAULTKV_KEY_HEX; using zero key\n";
  }

  int next_peer_id = 2;
  for (int i = 1; i < argc; ++i) {
    std::string a = argv[i];
    if (a == "--data-dir" && i + 1 < argc) {
      opts.data_dir = argv[++i];
    } else if (a == "--port" && i + 1 < argc) {
      opts.port = static_cast<uint16_t>(std::stoi(argv[++i]));
    } else if (a == "--replication") {
      opts.enable_replication = true;
    } else if (a == "--quorum" && i + 1 < argc) {
      opts.quorum_size = static_cast<size_t>(std::stoul(argv[++i]));
    } else if (a == "--node-id" && i + 1 < argc) {
      opts.node_id = std::stoi(argv[++i]);
    } else if (a == "--peer" && i + 1 < argc) {
      vaultkv::ReplicationPeer p;
      if (!parse_peer(argv[++i], next_peer_id++, &p)) {
        std::cerr << "warning: invalid --peer format, expected [id@]host:port\n";
      } else {
        cfg.peers.push_back(std::move(p));
      }
    } else if (a == "--help") {
      std::cout
          << "vaultkv-server --data-dir <dir> --port <port> [--replication] [--quorum N] [--node-id ID] "
             "[--peer [id@]host:port]\n";
      std::exit(0);
    }
  }
  return cfg;
}

}  // namespace

int main(int argc, char** argv) {
  const auto cfg = parse_options(argc, argv);
  const auto& opts = cfg.engine_options;
  vaultkv::StorageEngine engine(opts);
  auto st = engine.Open();
  if (!st.ok()) {
    std::cerr << "engine open failed: " << st.message << "\n";
    return 1;
  }

  if (opts.enable_replication) {
    if (cfg.peers.empty()) {
      std::cerr << "warning: replication enabled but no peers configured\n";
    } else {
      engine.SetReplicationPeers(cfg.peers, std::make_shared<vaultkv::TcpReplicationTransport>());
    }
  }

  vaultkv::EpollServer server(&engine, opts.port);
  g_server = &server;
  std::signal(SIGINT, on_signal);
  std::signal(SIGTERM, on_signal);

  std::cout << "vaultkv-server listening on port " << opts.port << " data_dir=" << opts.data_dir << "\n";
  if (opts.enable_replication) {
    std::cout << "replication enabled quorum=" << opts.quorum_size << " peers=" << cfg.peers.size() << "\n";
  }
  st = server.Start();
  if (!st.ok()) {
    std::cerr << "server error: " << st.message << "\n";
    return 2;
  }
  engine.Close();
  return 0;
}
