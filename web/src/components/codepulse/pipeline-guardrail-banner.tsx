import type { DeploymentState } from "@/types/api";
import { AlertOctagon, CheckCircle2 } from "lucide-react";

type PipelineGuardrailBannerProps = {
  deploymentState: DeploymentState;
  lastIncidentPr: string | null;
  loading?: boolean;
};

export function PipelineGuardrailBanner({
  deploymentState,
  lastIncidentPr,
  loading,
}: PipelineGuardrailBannerProps) {
  if (loading) {
    return (
      <div className="mb-6 h-16 animate-pulse rounded-xl bg-zinc-900/80 ring-1 ring-white/5" aria-hidden />
    );
  }

  if (deploymentState === "QUARANTINED") {
    const prLabel = lastIncidentPr?.trim() ? lastIncidentPr : "—";
    return (
      <div
        className="mb-6 rounded-xl border border-red-500/50 bg-red-950/40 px-5 py-4 ring-1 ring-red-500/30 animate-[pulse_2.5s_ease-in-out_infinite]"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertOctagon className="mt-0.5 size-5 shrink-0 text-red-400" aria-hidden />
          <p className="text-sm font-semibold text-red-100">
            ⚠️ DEPLOYMENT PIPELINE FROZEN: Automated quarantine shield activated on PR #{prLabel}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-5 py-4 ring-1 ring-emerald-500/20"
      role="status"
    >
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-hidden />
        <p className="text-sm font-medium text-emerald-100">
          ✅ Staging Pipeline Status: Active &amp; Secured.
        </p>
      </div>
    </div>
  );
}
