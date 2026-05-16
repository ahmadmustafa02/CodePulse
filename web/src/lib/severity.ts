export type Severity = "critical" | "high" | "medium" | "low";

export const severityColor: Record<Severity, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

export function normalizeSeverity(raw: string): Severity {
  const s = raw.toLowerCase();
  if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
  return "medium";
}
