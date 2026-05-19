import type { AgentTraceRecord } from "@/types/api";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { Terminal } from "lucide-react";

type AgentTraceConsoleProps = {
  traces: AgentTraceRecord[] | undefined;
  loading?: boolean;
  prFilter?: number;
};

function formatTraceTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusStyles(status: string): { text: string; icon: string } {
  const normalized = status.toUpperCase();
  if (normalized === "FLAGGED") {
    return { text: "text-amber-400", icon: "text-amber-400" };
  }
  if (normalized === "EXECUTED") {
    return { text: "text-red-400 animate-pulse", icon: "text-red-500 animate-pulse" };
  }
  return { text: "text-emerald-400", icon: "text-emerald-400" };
}

export function AgentTraceConsole({ traces, loading, prFilter }: AgentTraceConsoleProps) {
  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="border-b border-zinc-800/60 px-6 py-4">
        <PanelHeader
          title="Antigravity Agent Core Trace"
          hint={
            prFilter !== undefined
              ? `Live execution log · PR #${prFilter}`
              : "Live execution log · latest repository activity"
          }
        />
      </div>

      <div className="relative bg-[#0a0a0b] px-4 py-4 font-mono text-xs sm:px-6">
        <div className="mb-3 flex items-center gap-2 border-b border-zinc-800/80 pb-3 text-zinc-500">
          <Terminal className="size-3.5 text-emerald-500/80" />
          <span className="text-[10px] uppercase tracking-widest text-zinc-600">
            antigravity-core · stream
          </span>
          <span className="ml-auto text-[10px] text-zinc-600">TriageAgent → ReviewAgent → GuardrailAgent</span>
        </div>

        {loading ? (
          <div className="space-y-2 py-4" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-zinc-900/80" style={{ width: `${70 - i * 12}%` }} />
            ))}
          </div>
        ) : !traces || traces.length === 0 ? (
          <p className="py-6 text-zinc-600">
            No agent traces yet. Open or update a pull request to stream Antigravity reasoning here.
          </p>
        ) : (
          <ul className="max-h-[420px] space-y-2 overflow-y-auto py-1">
            {traces.map((trace) => {
              const styles = statusStyles(trace.status);
              return (
                <li key={trace.id} className="leading-relaxed">
                  <span className="text-zinc-600">[{formatTraceTimestamp(trace.createdAt)}]</span>{" "}
                  <span className={`font-semibold ${styles.text}`}>[{trace.status}]</span>{" "}
                  <span className={`${styles.icon}`}>{trace.agentName}</span>
                  <span className="text-zinc-500"> → </span>
                  <span className={styles.text}>{trace.message}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0a0a0b] to-transparent" aria-hidden />
      </div>
    </Panel>
  );
}
