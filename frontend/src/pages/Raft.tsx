import { useState } from "react";

import { apiUrl } from "../lib/runtimeConfig";
import { useClusterStore } from "../store/clusterStore";

interface EventRow {
  ts: number;
  msg: string;
  color: string;
}

export function Raft() {
  const nodes = useClusterStore((s) => s.nodes);
  const [events, setEvents] = useState<EventRow[]>([
    {
      ts: Date.now(),
      msg: "Cluster ready. Kill a node to trigger failover.",
      color: "text-zinc-400"
    }
  ]);

  function log(msg: string, color = "text-zinc-300") {
    setEvents((prev) => [{ ts: Date.now(), msg, color }, ...prev.slice(0, 79)]);
  }

  async function killNode(nodeId: number) {
    try {
      log(`Killing node ${nodeId}...`, "text-amber-300");
      const res = await fetch(apiUrl(`/api/nodes/${nodeId}/kill`), { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        log(`Kill failed: ${data.stderr ?? data.detail ?? "unknown error"}`, "text-red-400");
        return;
      }
      log(`Node ${nodeId} stopped. Watching for new leader election...`, "text-red-300");
      const prevLeader = nodes.find((n) => n.is_leader)?.node_id;
      let attempts = 0;
      const poll = setInterval(async () => {
        try {
          const status = await fetch(apiUrl("/api/cluster")).then((r) => r.json());
          const next = status.nodes.find((n: { is_leader: boolean; healthy: boolean }) => n.is_leader && n.healthy);
          if (next && next.node_id !== prevLeader) {
            log(`New leader elected: Node ${next.node_id}`, "text-teal-300");
            clearInterval(poll);
          }
        } catch {
          // Keep polling during transient errors.
        }
        attempts += 1;
        if (attempts > 20) {
          log("Timeout waiting for election", "text-red-400");
          clearInterval(poll);
        }
      }, 200);
    } catch (err) {
      log(`Kill request error: ${(err as Error).message}`, "text-red-400");
    }
  }

  async function restartNode(nodeId: number) {
    try {
      log(`Restarting node ${nodeId}...`, "text-zinc-300");
      const res = await fetch(apiUrl(`/api/nodes/${nodeId}/restart`), { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        log(`Restart failed: ${data.stderr ?? data.detail ?? "unknown error"}`, "text-red-400");
        return;
      }
      log(`Node ${nodeId} is back online.`, "text-sky-300");
    } catch (err) {
      log(`Restart request error: ${(err as Error).message}`, "text-red-400");
    }
  }

  return (
    <div className="grid h-full gap-4 p-6 lg:grid-cols-[330px_1fr]">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Cluster Topology</h2>
        {nodes.map((n) => (
          <div
            key={n.node_id}
            className={`rounded-xl border p-3 ${
              n.is_leader
                ? "border-sky-400/50 bg-sky-500/10"
                : n.healthy
                  ? "border-white/10 bg-black/30"
                  : "border-red-400/30 bg-red-500/10"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  n.healthy ? (n.is_leader ? "bg-sky-400" : "bg-teal-400") : "bg-red-500"
                }`}
              />
              <span className="font-mono text-xs text-zinc-200">
                Node {n.node_id} {n.is_leader ? "(LEADER)" : "(follower)"}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => killNode(n.node_id)}
                disabled={!n.healthy}
                className="flex-1 rounded bg-red-900/50 py-1 text-xs text-red-300 transition hover:bg-red-800 disabled:opacity-30"
              >
                Kill
              </button>
              <button
                onClick={() => restartNode(n.node_id)}
                disabled={n.healthy}
                className="flex-1 rounded bg-ink-800 py-1 text-xs text-zinc-300 transition hover:bg-ink-700 disabled:opacity-30"
              >
                Restart
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">Raft Event Log</h2>
        <div className="space-y-1.5 font-mono text-xs">
          {events.map((ev, i) => (
            <div key={`${ev.ts}-${i}`} className="flex gap-3">
              <span className="shrink-0 text-zinc-600">{new Date(ev.ts).toLocaleTimeString()}</span>
              <span className={ev.color}>{ev.msg}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
