/** Human-readable Antigravity session status for dashboard feed lines. */

export function describeAntigravityTraceLine(
  prNumber: number,
  repoFullName: string,
  logs: unknown,
): string {
  const repoLabel = repoFullName.includes("/") ? repoFullName : repoFullName;
  if (!Array.isArray(logs) || logs.length === 0) {
    return `PR #${prNumber} (${repoLabel}) — Session initializing…`;
  }
  const last = logs[logs.length - 1] as Record<string, unknown>;
  const agent = typeof last.agent === "string" ? last.agent : "";
  const msg = typeof last.message === "string" ? last.message.trim() : "";
  const kind = typeof last.kind === "string" ? last.kind : "";
  const msgLower = msg.toLowerCase();

  if (agent === "@ReviewerSwarm" && (msgLower.includes("chunk") || msgLower.includes("analyzing"))) {
    return `PR #${prNumber} — Triage complete: @ReviewerSwarm analyzing chunks…`;
  }
  if (agent === "@ReviewerSwarm") {
    return `PR #${prNumber} — @ReviewerSwarm: ${msg.slice(0, 64)}${msg.length > 64 ? "…" : ""}`;
  }
  if (agent === "@Triager" && (msgLower.includes("triage") || kind === "step")) {
    return `PR #${prNumber} — @Triager: ${msg.slice(0, 64)}${msg.length > 64 ? "…" : ""}`;
  }
  if (agent === "@HabitAnalyzer") {
    return `PR #${prNumber} — @HabitAnalyzer: habit context loaded.`;
  }
  if (agent === "@Orchestrator") {
    return `PR #${prNumber} — @Orchestrator: merging & severity scan…`;
  }
  if (kind === "transition") {
    return `PR #${prNumber} — ${msg.slice(0, 72)}${msg.length > 72 ? "…" : ""}`;
  }
  return `PR #${prNumber} (${repoLabel}) — ${agent || "Antigravity"}: ${msg.slice(0, 56)}${msg.length > 56 ? "…" : ""}`;
}
