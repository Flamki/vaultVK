import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { useMetricsStore } from "../store/metricsStore";

export function OpsChart() {
  const history = useMetricsStore((s) => s.history);
  const data = history.map((pt) => ({
    time: new Date(pt.ts * 1000).toLocaleTimeString(),
    SET: pt.set_ops_per_sec,
    GET: pt.get_ops_per_sec
  }));

  return (
    <section className="rounded-3xl border border-white/10 bg-black/25 p-4 animate-floatIn">
      <h3 className="mb-3 text-sm font-medium text-zinc-300">Live throughput (ops/s)</h3>
      {!data.length ? <p className="mb-3 text-xs text-zinc-500">Waiting for metric stream...</p> : null}
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="setGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="getGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fill: "#6b7280", fontSize: 11 }}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${v}`)}
          />
          <Tooltip
            contentStyle={{
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 10,
              color: "#e2e8f0"
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
          <Area
            type="monotone"
            dataKey="SET"
            stroke="#2dd4bf"
            strokeWidth={1.8}
            fill="url(#setGrad)"
            dot={false}
            animationDuration={0}
          />
          <Area
            type="monotone"
            dataKey="GET"
            stroke="#38bdf8"
            strokeWidth={1.8}
            fill="url(#getGrad)"
            dot={false}
            animationDuration={0}
          />
        </AreaChart>
      </ResponsiveContainer>
    </section>
  );
}
