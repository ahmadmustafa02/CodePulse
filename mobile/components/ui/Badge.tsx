import { Text, View } from "react-native";
import { cn } from "../../lib/cn";
import type { AntigravityAgent } from "../../types/api";
import type { Severity } from "../../types/api";

type SeverityVariant = "critical" | "high" | "medium" | "low";
type AgentVariant = "orchestrator" | "triager" | "reviewer" | "habit";
type StatusVariant = "pending" | "notified" | "active";

const SEVERITY: Record<SeverityVariant, string> = {
  critical: "border-red-500/40 bg-red-500/15 text-red-200",
  high: "border-orange-500/40 bg-orange-500/15 text-orange-200",
  medium: "border-yellow-500/40 bg-yellow-500/15 text-yellow-200",
  low: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
};

const AGENT: Record<AgentVariant, string> = {
  orchestrator: "border-purple-500/40 bg-purple-500/15 text-purple-200",
  triager: "border-blue-500/40 bg-blue-500/15 text-blue-200",
  reviewer: "border-orange-500/40 bg-orange-500/15 text-orange-200",
  habit: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
};

const STATUS: Record<StatusVariant, string> = {
  pending: "border-zinc-600/80 bg-zinc-800/80 text-zinc-300",
  notified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  active: "border-orange-500/40 bg-orange-500/10 text-orange-200",
};

export function agentVariantFromTrace(agent: AntigravityAgent): AgentVariant {
  if (agent === "@Orchestrator") return "orchestrator";
  if (agent === "@Triager") return "triager";
  if (agent === "@ReviewerSwarm") return "reviewer";
  return "habit";
}

export function Badge({
  children,
  variant,
  type,
  className,
}: {
  children: React.ReactNode;
  variant: SeverityVariant | AgentVariant | StatusVariant;
  type: "severity" | "agent" | "status";
  className?: string;
}) {
  const palette = type === "severity" ? SEVERITY : type === "agent" ? AGENT : STATUS;
  const styles = palette[variant as keyof typeof palette] ?? SEVERITY.medium;
  return (
    <View
      className={cn(
        "inline-flex max-w-full shrink-0 flex-row items-center rounded-md border px-1.5 py-0.5",
        styles,
        className,
      )}
    >
      <Text className="font-mono text-[10px] font-semibold leading-none tracking-tight">{children}</Text>
    </View>
  );
}
