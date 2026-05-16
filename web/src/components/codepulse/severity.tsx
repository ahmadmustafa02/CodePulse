import type { Severity } from "@/lib/severity";
import { severityColor } from "@/lib/severity";
import { cn } from "@/lib/utils";

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full", className)}
      style={{ backgroundColor: severityColor[severity] }}
      aria-label={severity}
    />
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const color = severityColor[severity];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{
        color,
        backgroundColor: `${color}1a`,
        borderColor: `${color}33`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {severity}
    </span>
  );
}