import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";

import { useClusterWS } from "./hooks/useClusterWS";
import { Dashboard } from "./pages/Dashboard";
import { Explorer } from "./pages/Explorer";
import { Raft } from "./pages/Raft";
import { useClusterStore } from "./store/clusterStore";

export default function App() {
  useClusterWS();
  const wsStatus = useClusterStore((s) => s.wsStatus);
  const nodes = useClusterStore((s) => s.nodes);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const healthy = useMemo(() => nodes.filter((n) => n.healthy).length, [nodes]);

  return (
    <div className="min-h-screen bg-surface text-zinc-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_10%_0%,rgba(45,212,191,0.16),transparent_35%),radial-gradient(circle_at_80%_15%,rgba(249,115,22,0.15),transparent_33%),radial-gradient(circle_at_40%_95%,rgba(56,189,248,0.14),transparent_35%)]" />
      <header className="sticky top-0 z-20 border-b border-white/10 bg-ink-950/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="space-y-0.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-zinc-500">VaultKV Console</p>
            <h1 className="text-lg font-semibold text-zinc-100">Distributed Storage Operations</h1>
          </div>
          <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 p-1">
            <TopNavLink to="/">Dashboard</TopNavLink>
            <TopNavLink to="/explorer">Explorer</TopNavLink>
            <TopNavLink to="/raft">Raft Demo</TopNavLink>
          </nav>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span
              className={`rounded-full border px-2.5 py-1 ${
                wsStatus === "open"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                  : wsStatus === "connecting"
                    ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
                    : "border-rose-400/40 bg-rose-500/10 text-rose-300"
              }`}
            >
              WS {wsStatus}
            </span>
            <span className="rounded-full border border-sky-400/35 bg-sky-500/10 px-2.5 py-1 text-sky-200">
              nodes {healthy}/{Math.max(nodes.length, 3)}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-zinc-300">
              {now.toLocaleTimeString()}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] pb-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/explorer" element={<Explorer />} />
          <Route path="/raft" element={<Raft />} />
        </Routes>
      </main>
    </div>
  );
}

function TopNavLink({ to, children }: { to: string; children: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `rounded-full px-3.5 py-1.5 text-sm transition ${
          isActive
            ? "bg-white text-ink-950 shadow-[0_6px_28px_-14px_rgba(255,255,255,0.95)]"
            : "text-zinc-300 hover:bg-white/10 hover:text-zinc-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
