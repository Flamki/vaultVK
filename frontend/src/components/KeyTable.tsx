type ResultRow = {
  op: "GET" | "SET" | "DEL" | "SCAN";
  key: string;
  value?: string;
  latency_ms: number;
  ok: boolean;
  error?: string;
  ts: number;
};

interface Props {
  rows: ResultRow[];
}

export function KeyTable({ rows }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/80">
      <table className="w-full text-left font-mono text-xs">
        <thead className="bg-ink-800 text-zinc-400">
          <tr>
            <th className="px-3 py-2">op</th>
            <th className="px-3 py-2">key</th>
            <th className="px-3 py-2">result</th>
            <th className="px-3 py-2 text-right">latency</th>
            <th className="px-3 py-2 text-center">status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={`${r.ts}-${idx}`} className="border-t border-ink-800/80 hover:bg-ink-800/40">
              <td className="px-3 py-2 text-amber-300">{r.op}</td>
              <td className="px-3 py-2 text-sky-300">{r.key}</td>
              <td className="max-w-[400px] truncate px-3 py-2 text-zinc-300">{r.value ?? r.error ?? "-"}</td>
              <td className="px-3 py-2 text-right text-orange-300">{r.latency_ms.toFixed(1)}ms</td>
              <td className="px-3 py-2 text-center">
                <span className={r.ok ? "text-emerald-300" : "text-red-400"}>{r.ok ? "OK" : "ERR"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

