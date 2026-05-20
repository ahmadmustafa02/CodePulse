import { useEffect, useRef, useState } from "react";
import { getAgentTracesForPullRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AgentTraceLogEntry, AntigravityAgent } from "@/types/api";

const POLL_MS = 1500;

export type AgentConsoleProps = {
  pullRequestId: string;
  className?: string;
};

function readMeta(entry: AgentTraceLogEntry): Record<string, unknown> {
  const m = entry.meta;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    return m as Record<string, unknown>;
  }
  return {};
}

function showHandoffArrow(entry: AgentTraceLogEntry): boolean {
  const meta = readMeta(entry);
  if (entry.kind === "transition") {
    return true;
  }
  return typeof meta.previous_interaction_id === "string" && meta.previous_interaction_id.length > 0;
}

function isOrchestratorGateEntry(entry: AgentTraceLogEntry): boolean {
  const meta = readMeta(entry);
  return (
    entry.agent === "@Orchestrator" &&
    entry.kind === "thought" &&
    typeof meta.reviewCount === "number" &&
    typeof meta.highRiskCount === "number"
  );
}

const AGENT_BADGE: Record<AntigravityAgent, string> = {
  "@Orchestrator":
    "border-purple-500/40 bg-purple-500/15 text-purple-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  "@Triager":
    "border-blue-500/40 bg-blue-500/15 text-blue-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  "@ReviewerSwarm":
    "border-orange-500/40 bg-orange-500/15 text-orange-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
  "@HabitAnalyzer":
    "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
};

const PILL_BASE =
  "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none tracking-wide";

function AgentBadge({ agent }: { agent: AntigravityAgent }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none tracking-tight",
        AGENT_BADGE[agent],
      )}
    >
      {agent}
    </span>
  );
}

function lineClassName(entry: AgentTraceLogEntry, isGate: boolean): string {
  const kind = entry.kind;
  const agent = entry.agent;
  const msgUpper = entry.message.toUpperCase();

  const base =
    "rounded-sm border-l-2 border-transparent pl-2 py-1 font-mono text-[12px] leading-relaxed [font-variant-ligatures:none] break-words";

  if (isGate) {
    return cn(
      base,
      "my-1.5 border border-violet-500/35 border-l-violet-400/80 bg-violet-950/30 py-2 pl-3 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    );
  }

  if (kind === "session" || kind === "transition") {
    return cn(base, "border-orange-500/60 font-semibold text-orange-400");
  }

  if (agent === "@ReviewerSwarm" && (msgUpper.includes("CRITICAL") || msgUpper.includes("ALERT"))) {
    return cn(base, "font-semibold text-red-500");
  }

  if (agent === "@HabitAnalyzer") {
    return cn(base, "text-amber-200/90");
  }

  if (agent === "@Triager") {
    return cn(base, "text-zinc-300");
  }

  if (agent === "@Orchestrator") {
    return cn(base, "text-zinc-200");
  }

  if (agent === "@ReviewerSwarm") {
    return cn(base, "text-zinc-300");
  }

  return cn(base, "text-zinc-400");
}

function LogRow({ entry }: { entry: AgentTraceLogEntry }) {
  const meta = readMeta(entry);
  const ts = entry.timestamp || "—";
  const isGate = isOrchestratorGateEntry(entry);
  const handoff = showHandoffArrow(entry);
  const envAntigravity = meta.environment === "antigravity";
  const reviewMode = meta.reviewMode;
  const showReviewModeTag =
    reviewMode === "deep" || reviewMode === "lightweight" ? String(reviewMode) : null;

  return (
    <div className={lineClassName(entry, isGate)}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {handoff ? (
          <span className="shrink-0 font-mono text-[11px] font-semibold text-zinc-500" aria-hidden>
            →
          </span>
        ) : null}
        <AgentBadge agent={entry.agent} />
        {envAntigravity ? (
          <span
            className={cn(
              PILL_BASE,
              "border-amber-500/35 bg-amber-500/10 text-amber-200/95",
            )}
          >
            ⚡ Antigravity
          </span>
        ) : null}
        {showReviewModeTag ? (
          <span
            className={cn(
              PILL_BASE,
              "border-zinc-600/80 bg-zinc-800/80 text-zinc-300",
            )}
          >
            {showReviewModeTag}
          </span>
        ) : null}
        <span className="font-mono text-[10px] text-zinc-600">[{ts}]</span>
      </div>
      <div
        className={cn(
          "mt-1 whitespace-pre-wrap pl-0.5",
          isGate ? "text-[13px] font-medium leading-snug text-zinc-100" : "",
        )}
      >
        {entry.message}
      </div>
    </div>
  );
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
            <LogRow key={`${entry.timestamp}-${i}`} entry={entry} />
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
