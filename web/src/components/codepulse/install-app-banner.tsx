import { Github } from "lucide-react";
import { GITHUB_APP_INSTALL_URL } from "@/lib/constants";

export function InstallAppBanner() {
  return (
    <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 ring-1 ring-amber-500/20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-100">
            Connect your repositories to start getting AI code reviews
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Install the CodePulse GitHub App on the repos you want reviewed.
          </p>
        </div>
        <a
          href={GITHUB_APP_INSTALL_URL}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          <Github className="size-4" />
          Install GitHub App
        </a>
      </div>
    </div>
  );
}
