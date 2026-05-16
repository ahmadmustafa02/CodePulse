import { createFileRoute, Link } from "@tanstack/react-router";
import { ensureLoggedIn } from "@/lib/route-guard";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { GitPullRequest, FileCode, Inbox } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { SeverityStackBar } from "@/components/codepulse/charts";
import { ChartSkeleton, ListSkeleton } from "@/components/codepulse/skeletons";
import { SeverityBadge, SeverityDot } from "@/components/codepulse/severity";
import { EmptyState } from "@/components/codepulse/empty-state";
import {
  aggregateTopFiles,
  api,
  apiBaseUrl,
  buildWeeklySeverityForRepo,
  getReviews,
} from "@/lib/api";

export const Route = createFileRoute("/repos/$owner/$repo")({
  beforeLoad: () => ensureLoggedIn(),
  head: ({ params }) => ({
    meta: [{ title: `${params.owner}/${params.repo} · CodePulse` }],
  }),
  component: RepoPage,
});

function RepoPage() {
  const { owner, repo } = Route.useParams();
  const repoQ = useQuery({ queryKey: ["repo", owner, repo], queryFn: () => api.repo(owner, repo) });
  const pullsQ = useQuery({ queryKey: ["pulls", owner, repo], queryFn: () => api.pullsFor(`${owner}/${repo}`) });
  const reviewsQ = useQuery({ queryKey: ["reviews", "repo", owner, repo], queryFn: getReviews });

  const weekly = useMemo(
    () => (reviewsQ.data ? buildWeeklySeverityForRepo(reviewsQ.data, owner, repo) : []),
    [reviewsQ.data, owner, repo],
  );

  const topFiles = useMemo(
    () => (reviewsQ.data ? aggregateTopFiles(reviewsQ.data, owner, repo) : []),
    [reviewsQ.data, owner, repo],
  );

  return (
    <AppShell eyebrow="Repository" title={`${owner}/${repo}`}>
      {(repoQ.isError || pullsQ.isError || reviewsQ.isError) && (
        <Panel className="mb-6">
          <p className="text-sm text-red-400">Could not load repository data. Is the API running at {apiBaseUrl}?</p>
        </Panel>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {reviewsQ.isLoading ? (
            <ChartSkeleton />
          ) : (
            <Panel>
              <PanelHeader title="Severity over time" hint="All authors, last 8 weeks" />
              <SeverityStackBar data={weekly} />
            </Panel>
          )}
        </div>
        {!repoQ.data ? (
          <ChartSkeleton height={180} />
        ) : (
          <Panel>
            <PanelHeader title="Repository health" />
            <div className="space-y-5">
              <Metric label="Coverage" value={`${repoQ.data.health}%`} pct={repoQ.data.health} />
              <Metric label="Open PRs" value={String(repoQ.data.openPRs)} pct={(repoQ.data.openPRs / 50) * 100} />
              <Metric label="Lifetime reviewed" value={repoQ.data.reviewed.toLocaleString()} pct={80} />
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Primary language</span>
                <span className="text-zinc-200">{repoQ.data.language}</span>
              </div>
            </div>
          </Panel>
        )}
      </div>

      <div className="mt-8">
        {pullsQ.isLoading || !pullsQ.data ? (
          <ListSkeleton rows={6} />
        ) : pullsQ.data.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No pull requests yet"
            body="When a PR opens against this repository, CodePulse will review it within seconds."
          />
        ) : (
          <Panel padded={false}>
            <div className="flex items-center justify-between border-b border-zinc-800/60 px-6 py-4">
              <h3 className="text-sm font-medium text-zinc-100">Pull requests</h3>
              <span className="text-xs text-zinc-500">{pullsQ.data.length} total</span>
            </div>
            <ul className="divide-y divide-zinc-800/60">
              {pullsQ.data.map((p) => (
                <li key={p.id} className="px-6 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <GitPullRequest className="size-4 text-zinc-500" />
                        <span className="text-sm font-medium text-zinc-100">{p.title}</span>
                        <SeverityBadge severity={p.severity} />
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        #{p.id} opened by{" "}
                        <Link to="/developers/$id" params={{ id: p.authorId }} className="text-zinc-300 hover:text-zinc-100">
                          @{p.author}
                        </Link>{" "}
                        · {p.files} files · +{p.additions} −{p.deletions} · {p.comments} comments
                      </p>
                    </div>
                    <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                      {p.state}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      <div className="mt-8">
        <Panel padded={false}>
          <div className="border-b border-zinc-800/60 px-6 py-4">
            <h3 className="text-sm font-medium text-zinc-100">Top files by findings</h3>
          </div>
          {topFiles.length === 0 ? (
            <p className="px-6 py-6 text-xs text-zinc-500">No findings recorded for this repository yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {topFiles.map((f) => (
                <li key={f.path} className="flex items-center justify-between px-6 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileCode className="size-4 text-zinc-500" />
                    <span className="truncate font-mono text-xs text-zinc-300">{f.path}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <SeverityDot severity="critical" /> {f.critical}
                    </span>
                    <span className="flex items-center gap-1">
                      <SeverityDot severity="high" /> {f.high}
                    </span>
                    <span className="flex items-center gap-1">
                      <SeverityDot severity="medium" /> {f.medium}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function Metric({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-200">{value}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-900">
        <div className="h-full rounded-full bg-zinc-300" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
