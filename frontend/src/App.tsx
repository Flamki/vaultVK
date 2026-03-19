import { NavLink, Route, Routes } from "react-router-dom";

import { useClusterWS } from "./hooks/useClusterWS";
import { Dashboard } from "./pages/Dashboard";
import { Explorer } from "./pages/Explorer";
import { Raft } from "./pages/Raft";
import { useClusterStore } from "./store/clusterStore";

export default function App() {
  useClusterWS();
  const wsStatus = useClusterStore((s) => s.wsStatus);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.08),_transparent_40%),radial-gradient(circle_at_bottom_left,_rgba(45,212,191,0.08),_transparent_45%),#090b10] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-ink-700/70 bg-ink-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 py-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-zinc-500">VaultKV Control Plane</p>
            <h1 className="text-lg font-semibold text-zinc-100">Phase 2 Dashboard</h1>
          </div>
          <nav className="flex items-center gap-2">
            <TopNavLink to="/">Dashboard</TopNavLink>
            <TopNavLink to="/explorer">Explorer</TopNavLink>
            <TopNavLink to="/raft">Raft Demo</TopNavLink>
            <span className="ml-2 rounded bg-ink-800 px-2 py-1 font-mono text-[10px] text-zinc-300">WS {wsStatus}</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px]">
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
        `rounded-md px-3 py-1.5 text-sm transition ${
          isActive ? "bg-sky-600 text-white" : "text-zinc-300 hover:bg-ink-800 hover:text-zinc-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

