import { createFileRoute, Link } from "@tanstack/react-router";
import { ensureLoggedIn } from "@/lib/route-guard";
import { fetchSession, hasInstallation } from "@/lib/auth";
import { InstallAppBanner } from "@/components/codepulse/install-app-banner";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, GitPullRequest, Inbox } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { PRVolumeArea, LatencyLine } from "@/components/codepulse/charts";
import { ChartSkeleton, ListSkeleton, CardGridSkeleton } from "@/components/codepulse/skeletons";
import { EmptyState } from "@/components/codepulse/empty-state";
import { SeverityBadge } from "@/components/codepulse/severity";
import { api } from "@/lib/api";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: () => ensureLoggedIn(),
  head: () => ({ meta: [{ title: "Dashboard · CodePulse" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const sessionQ = useQuery({ queryKey: ["session"], queryFn: fetchSession });
  const installed = hasInstallation(sessionQ.data);

  const repos = useQuery({ queryKey: ["repos"], queryFn: api.repos, enabled: installed });
  const pulls = useQuery({ queryKey: ["pulls"], queryFn: api.pulls, enabled: installed });
  const volume = useQuery({ queryKey: ["volume"], queryFn: api.prVolume, enabled: installed });
  const latency = useQuery({ queryKey: ["latency"], queryFn: api.reviewLatency, enabled: installed });

  const totals = pulls.data
    ? {
        open: pulls.data.filter((p) => p.state !== "merged").length,
        critical: pulls.data.filter((p) => p.severity === "critical").length,
        merged: pulls.data.filter((p) => p.state === "merged").length,
        reviewed: repos.data?.reduce((s, r) => s + r.reviewed, 0) ?? 0,
      }
    : null;

  return (
    <AppShell eyebrow="This week" title="Pulse overview">
      {!installed && !sessionQ.isLoading ? <InstallAppBanner /> : null}
      {!installed ? (
        <Panel>
          <p className="text-sm text-zinc-500">
            Install the GitHub App to see PR reviews, repository health, and team insights here.
          </p>
        </Panel>
      ) : !totals ? (
        <CardGridSkeleton />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Open PRs" value={totals.open} />
          <Stat label="Critical findings" value={totals.critical} accent="#ef4444" />
          <Stat label="Merged this week" value={totals.merged} />
          <Stat label="PRs reviewed all-time" value={totals.reviewed.toLocaleString()} />
        </div>
      )}

      {installed ? (
      <>
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {volume.isLoading || !volume.data ? (
            <ChartSkeleton height={260} />
          ) : (
            <Panel>
              <PanelHeader title="PR volume vs reviews" hint="Last 8 weeks" />
              <PRVolumeArea data={volume.data} />
            </Panel>
          )}
        </div>
        {latency.isLoading || !latency.data ? (
          <ChartSkeleton height={180} />
        ) : (
          <Panel>
            <PanelHeader title="Avg review latency" hint="Seconds, per day" />
            <LatencyLine data={latency.data} />
          </Panel>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {pulls.isLoading || !pulls.data ? (
            <ListSkeleton />
          ) : pulls.data.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No PRs in flight"
              body="When your team opens a pull request, CodePulse will review it automatically and you'll see it here."
              action={
                <Link to="/settings" className="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900">
                  Connect a repository
                </Link>
              }
            />
          ) : (
            <Panel padded={false}>
              <div className="flex items-center justify-between border-b border-zinc-800/60 px-6 py-4">
                <h3 className="text-sm font-medium text-zinc-100">Recent reviews</h3>
                {repos.data?.[0] ? (
                  <Link
                    to="/repos/$owner/$repo"
                    params={{ owner: repos.data[0].owner, repo: repos.data[0].name }}
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    All repos <ArrowUpRight className="size-3" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                    All repos <ArrowUpRight className="size-3" />
                  </span>
                )}
              </div>
              <ul className="divide-y divide-zinc-800/60">
                {pulls.data.slice(0, 6).map((p) => {
                  const [owner, repo] = p.repo.split("/");
                  return (
                    <li key={p.id}>
                      <Link
                        to="/repos/$owner/$repo"
                        params={{ owner, repo }}
                        className="flex items-start gap-4 px-6 py-4 transition-colors hover:bg-zinc-900/40"
                      >
                        <GitPullRequest className="mt-0.5 size-4 text-zinc-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-zinc-100">{p.title}</span>
                            <SeverityBadge severity={p.severity} />
                          </div>
                          <p className="mt-1 truncate text-xs text-zinc-500">
                            {p.repo} · #{p.id} · @{p.author} · +{p.additions} −{p.deletions}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>

        <div className="lg:col-span-2">
          {repos.isLoading || !repos.data ? (
            <ListSkeleton rows={4} />
          ) : repos.data.length === 0 ? (
            <Panel>
              <h3 className="text-sm font-medium text-zinc-100">Connected repositories</h3>
              <p className="mt-2 text-sm text-zinc-500">
                No repositories yet. In GitHub, open your CodePulse app installation and confirm the
                repos you want reviewed are selected, then refresh this page.
              </p>
            </Panel>
          ) : (
            <Panel padded={false}>
              <div className="border-b border-zinc-800/60 px-6 py-4">
                <h3 className="text-sm font-medium text-zinc-100">Connected repositories</h3>
              </div>
              <ul className="divide-y divide-zinc-800/60">
                {repos.data.map((r) => (
                  <li key={r.id}>
                    <Link
                      to="/repos/$owner/$repo"
                      params={{ owner: r.owner, repo: r.name }}
                      className="flex items-center justify-between px-6 py-4 hover:bg-zinc-900/40"
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-100">{r.owner}/{r.name}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">{r.language} · {r.openPRs} open</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-zinc-200">{r.health}%</div>
                        <div className="text-[10px] uppercase tracking-widest text-zinc-600">health</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
      </>
      ) : null}
    </AppShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <Panel>
      <div className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-medium" style={{ color: accent ?? "#fafafa" }}>{value}</div>
    </Panel>
  );
}