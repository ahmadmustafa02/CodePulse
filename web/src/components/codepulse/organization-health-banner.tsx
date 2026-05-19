import type { DeploymentState } from "@/types/api";
import { AlertTriangle, ShieldCheck } from "lucide-react";

type RepoGuardrail = {
  deploymentState: DeploymentState;
};

export function OrganizationHealthBanner({ repos }: { repos: RepoGuardrail[] | undefined }) {
  if (!repos || repos.length === 0) {
    return null;
  }

  const quarantinedCount = repos.filter((r) => r.deploymentState === "QUARANTINED").length;

  if (quarantinedCount > 0) {
    return (
      <div
        className="mb-6 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/80 via-amber-900/30 to-zinc-950 px-5 py-4 ring-1 ring-amber-500/20"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-amber-100">
              ⚠️ SECURITY ALARM: An automated Antigravity guardrail has quarantined{" "}
              {quarantinedCount === 1 ? "1" : quarantinedCount} or more pipelines due to a critical
              vulnerability threat. Manual review required.
            </p>
            <p className="mt-1 text-xs text-amber-200/70">
              Inspect affected repositories below and review the Agent Core trace before releasing
              deployments.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mb-6 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-950/30 px-4 py-2.5 text-sm text-emerald-200/90"
      role="status"
    >
      <ShieldCheck className="size-4 shrink-0 text-emerald-400" aria-hidden />
      <span>🛡️ All system pipelines protected and healthy.</span>
    </div>
  );
}
