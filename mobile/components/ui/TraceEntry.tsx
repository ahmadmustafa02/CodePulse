import { Text, View } from "react-native";
import type { AgentTraceLogEntry } from "../../types/api";
import { AntigravityPill } from "./AntigravityPill";
import { Badge, agentVariantFromTrace } from "./Badge";
import { cn } from "../../lib/cn";

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

function lineClassName(entry: AgentTraceLogEntry, isGate: boolean): string {
  const kind = entry.kind;
  const agent = entry.agent;
  const msgUpper = entry.message.toUpperCase();

  const base =
    "rounded-sm border-l-2 border-transparent py-1 pl-2 font-mono text-[12px] leading-relaxed";

  if (isGate) {
    return cn(
      base,
      "my-1.5 border border-violet-500/35 border-l-violet-400/80 bg-violet-950/30 py-2 pl-3 pr-2",
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

export function TraceEntry({ entry }: { entry: AgentTraceLogEntry }) {
  const meta = readMeta(entry);
  const ts = entry.timestamp || "—";
  const isGate = isOrchestratorGateEntry(entry);
  const handoff = showHandoffArrow(entry);
  const envAntigravity = meta.environment === "antigravity";
  const reviewMode = meta.reviewMode;
  const showReviewModeTag =
    reviewMode === "deep" || reviewMode === "lightweight" ? String(reviewMode) : null;
  const isTool = entry.kind === "tool";

  const inner = (
    <View className={lineClassName(entry, isGate)}>
      <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
        {handoff ? (
          <Text className="shrink-0 font-mono text-[11px] font-semibold text-zinc-500">→</Text>
        ) : null}
        <Badge type="agent" variant={agentVariantFromTrace(entry.agent)}>
          {entry.agent}
        </Badge>
        {envAntigravity ? <AntigravityPill /> : null}
        {showReviewModeTag ? (
          <View className="rounded-full border border-zinc-600/80 bg-zinc-800/80 px-2 py-0.5">
            <Text className="text-[10px] font-medium leading-none tracking-wide text-zinc-300">
              {showReviewModeTag}
            </Text>
          </View>
        ) : null}
        <Text className="font-mono text-[10px] text-zinc-600">[{ts}]</Text>
      </View>
      <Text
        className={cn(
          "mt-1 pl-0.5 font-mono text-[12px] leading-relaxed",
          isGate ? "text-[13px] font-medium leading-snug text-zinc-100" : "",
        )}
      >
        {entry.message}
      </Text>
    </View>
  );

  if (isTool) {
    return (
      <View className="my-1 rounded-lg border border-zinc-800/90 bg-zinc-950/80 p-2 ring-1 ring-white/[0.03]">
        {inner}
      </View>
    );
  }

  return inner;
}
