import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useClusterStore } from "../store/clusterStore";

export function LagChart() {
  const nodes = useClusterStore((s) => s.nodes);
  const data = nodes.map((n) => ({
    name: `N${n.node_id}`,
    lag: Number(n.lag_ms.toFixed(1)),
    healthy: n.healthy
  }));

  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-900/80 p-4 animate-floatIn">
      <h3 className="mb-3 text-sm font-medium text-zinc-300">Replication lag (ms)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 10,
              color: "#e2e8f0"
            }}
          />
          <Bar dataKey="lag" fill="#fb923c" radius={[8, 8, 0, 0]} animationDuration={0} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

