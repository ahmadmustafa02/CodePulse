import { useEffect, useRef, useState } from "react";
import { getAgentTracesForPullRequest } from "@/lib/api";
import type { AgentTraceLogEntry } from "@/types/api";
import { cn } from "@/lib/utils";

const POLL_MS = 1500;

export type AgentConsoleProps = {
  pullRequestId: string;
  className?: string;
};

function formatLine(entry: AgentTraceLogEntry): string {
  const ts = entry.timestamp || "—";
  return `[${ts}] ${entry.agent}  ${entry.message}`;
}

function lineClassName(entry: AgentTraceLogEntry): string {
  const kind = entry.kind;
  const agent = entry.agent;
  const msgUpper = entry.message.toUpperCase();

  const base =
    "font-mono text-[12px] leading-relaxed [font-variant-ligatures:none] whitespace-pre-wrap break-words border-l-2 border-transparent pl-2 py-0.5";

  if (kind === "session" || kind === "transition") {
    return cn(base, "border-orange-500/60 font-semibold text-orange-400");
  }

  if (agent === "@ReviewerSwarm" && (msgUpper.includes("CRITICAL") || msgUpper.includes("ALERT"))) {
    return cn(base, "font-semibold text-red-500");
  }

  if (agent === "@HabitAnalyzer") {
    return cn(base, "text-amber-300");
  }

  if (agent === "@Triager") {
    return cn(base, "text-emerald-400");
  }

  if (agent === "@Orchestrator") {
    return cn(base, "text-zinc-200");
  }

  if (agent === "@ReviewerSwarm") {
    return cn(base, "text-sky-300");
  }

  return cn(base, "text-zinc-400");
}

export function AgentConsole({ pullRequestId, className }: AgentConsoleProps) {
  const [logs, setLogs] = useState<AgentTraceLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pullRequestId.trim()) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const payload = await getAgentTracesForPullRequest(pullRequestId.trim());
        if (cancelled) return;
        setLogs(payload.logs);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load traces");
      }
    };

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pullRequestId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  if (!pullRequestId.trim()) {
    return (
      <div
        className={cn(
          "rounded-lg border border-zinc-800 bg-[#0c0c0e] p-4 font-mono text-xs text-zinc-500",
          className,
        )}
      >
        No pull request selected.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#09090b] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 bg-black/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-500/90 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Antigravity session
          </span>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">poll {POLL_MS / 1000}s</span>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[min(420px,55vh)] min-h-[200px] overflow-y-auto overscroll-contain bg-[#050506] px-2 py-3"
        style={{
          fontFamily:
            '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        }}
      >
        {error ? (
          <p className="px-2 py-1 font-mono text-xs text-red-400">{error}</p>
        ) : logs.length === 0 ? (
          <p className="px-2 py-1 font-mono text-xs text-zinc-600">Waiting for agent logs…</p>
        ) : (
          logs.map((entry, i) => (
            <div key={`${entry.timestamp}-${i}`} className={lineClassName(entry)}>
              {formatLine(entry)}
            </div>
          ))
        )}

        <div className="mt-1 flex items-center gap-0.5 px-2 font-mono text-xs text-zinc-500">
          <span className="text-zinc-600">&gt;</span>
          <span
            className="inline-block min-w-[0.55em] text-orange-400"
            style={{
              animation: "agent-console-cursor 1s step-end infinite",
            }}
          >
            _
          </span>
        </div>
      </div>

      <style>{`
        @keyframes agent-console-cursor {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
