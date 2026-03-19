import { LagChart } from "../components/LagChart";
import { NodeCard } from "../components/NodeCard";
import { OpsChart } from "../components/OpsChart";
import { useClusterStore } from "../store/clusterStore";

export function Dashboard() {
  const nodes = useClusterStore((s) => s.nodes);
  const wsStatus = useClusterStore((s) => s.wsStatus);
  const leader = nodes.find((n) => n.is_leader);

  return (
    <div className="space-y-4 p-6">
      <header className="animate-floatIn rounded-2xl border border-ink-700 bg-gradient-to-r from-ink-900 via-ink-800 to-ink-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Cluster Dashboard</h1>
            <p className="text-sm text-zinc-400">
              Live telemetry from FastAPI WebSocket stream with 500ms updates.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="rounded bg-ink-800 px-2 py-1 text-zinc-300">WS: {wsStatus}</span>
            <span className="rounded bg-sky-900/30 px-2 py-1 text-sky-300">
              Leader: {leader ? `Node ${leader.node_id}` : "unknown"}
            </span>
          </div>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {nodes.map((node) => (
          <NodeCard key={node.node_id} node={node} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <OpsChart />
        <LagChart />
      </section>
    </div>
  );
}

