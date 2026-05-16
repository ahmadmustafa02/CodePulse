import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Github, Trash2 } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { InstallAppBanner } from "@/components/codepulse/install-app-banner";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { ListSkeleton } from "@/components/codepulse/skeletons";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { fetchSession, hasInstallation, signOut } from "@/lib/auth";
import { GITHUB_APP_INSTALL_URL, githubInstallationSettingsUrl } from "@/lib/constants";
import { ensureLoggedIn } from "@/lib/route-guard";

export const Route = createFileRoute("/settings")({
  beforeLoad: () => ensureLoggedIn(),
  head: () => ({ meta: [{ title: "Settings · CodePulse" }] }),
  component: SettingsPage,
});

const defaultRules = [
  { id: "concurrency", label: "Race conditions & concurrency", description: "Flag shared-state mutations without atomic guards.", enabled: true },
  { id: "errors", label: "Error handling", description: "Catch unhandled promise rejections and stream errors.", enabled: true },
  { id: "perf", label: "Performance heuristics", description: "Detect N+1 queries and unbounded loops over user input.", enabled: true },
  { id: "types", label: "Type-safety lapses", description: "Surface implicit any and widened return types.", enabled: false },
  { id: "tests", label: "Missing or skipped tests", description: "Catch new code paths shipped without coverage.", enabled: true },
];

function ComingSoonNote() {
  return (
    <p className="mb-4 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
      Coming soon — these controls are preview-only and are not saved yet.
    </p>
  );
}

function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionQ = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000,
  });
  const installed = hasInstallation(sessionQ.data);
  const repos = useQuery({ queryKey: ["repos"], queryFn: api.repos, enabled: installed });
  const [rules, setRules] = useState(defaultRules);
  const [cadence, setCadence] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await signOut();
      queryClient.clear();
      await router.navigate({ to: "/", search: {} });
    } finally {
      setDisconnecting(false);
    }
  }

  const session = sessionQ.data;

  return (
    <AppShell eyebrow="Workspace" title="Settings">
      {!installed && !sessionQ.isLoading ? <InstallAppBanner /> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {session ? (
            <Panel>
              <PanelHeader title="GitHub account" hint="Signed in via GitHub OAuth." />
              <div className="flex items-center gap-4">
                {session.avatarUrl ? (
                  <img
                    src={session.avatarUrl}
                    alt=""
                    className="size-12 rounded-full ring-1 ring-zinc-700"
                  />
                ) : (
                  <div className="grid size-12 place-items-center rounded-full border border-zinc-800 bg-zinc-900">
                    <Github className="size-5 text-zinc-400" />
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-zinc-100">@{session.githubLogin}</div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {installed
                      ? "GitHub App installed — repositories below are connected for review."
                      : "Install the GitHub App to connect repositories."}
                  </p>
                </div>
              </div>
            </Panel>
          ) : null}

          {!installed ? (
            <Panel>
              <p className="text-sm text-zinc-500">
                No repositories connected yet. Install the GitHub App to choose which repos CodePulse reviews.
              </p>
              <a
                href={GITHUB_APP_INSTALL_URL}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
              >
                <Github className="size-4" />
                Install GitHub App
              </a>
            </Panel>
          ) : repos.isLoading || !repos.data ? (
            <ListSkeleton rows={4} />
          ) : (
            <Panel padded={false}>
              <div className="flex items-center justify-between border-b border-zinc-800/60 px-6 py-4">
                <div>
                  <h3 className="text-sm font-medium text-zinc-100">Connected repositories</h3>
                  <p className="mt-0.5 text-xs text-zinc-500">CodePulse reviews PRs opened against any of these.</p>
                </div>
                {session?.installationId ? (
                  <a
                    href={githubInstallationSettingsUrl(session.installationId)}
                    className="rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-white"
                  >
                    Add / manage repositories
                  </a>
                ) : null}
              </div>
              <ul className="divide-y divide-zinc-800/60">
                {repos.data.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">{r.owner}/{r.name}</div>
                      <p className="mt-0.5 text-xs text-zinc-500">{r.language} · {r.reviewed.toLocaleString()} PRs reviewed</p>
                    </div>
                    <Switch defaultChecked />
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel>
            <PanelHeader title="Review rules" hint="Toggle which patterns CodePulse reports." />
            <ComingSoonNote />
            <ul className="divide-y divide-zinc-800/60">
              {rules.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200">{r.label}</div>
                    <p className="mt-1 text-xs text-zinc-500">{r.description}</p>
                  </div>
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v) =>
                      setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)))
                    }
                  />
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Digest cadence" hint="When to send the weekly learning email." />
            <ComingSoonNote />
            <div className="space-y-2">
              {(["weekly", "biweekly", "monthly"] as const).map((c) => (
                <label
                  key={c}
                  className="flex cursor-pointer items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
                >
                  <span className="capitalize">{c}</span>
                  <input
                    type="radio"
                    name="cadence"
                    checked={cadence === c}
                    onChange={() => setCadence(c)}
                    className="accent-zinc-200"
                  />
                </label>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-widest" style={{ color: "#ef4444" }}>
              <AlertTriangle className="size-3.5" /> Danger zone
            </div>
            <p className="mb-4 text-xs text-zinc-500">
              Disconnecting signs you out and clears your session. Existing GitHub review comments stay in place.
            </p>
            <button
              type="button"
              disabled={disconnecting}
              onClick={() => void handleDisconnect()}
              className="inline-flex items-center gap-2 rounded-md border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-1.5 text-xs font-medium text-[#ef4444] hover:bg-[#ef4444]/15 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" /> {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
