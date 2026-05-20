import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ensureLoggedIn } from "@/lib/route-guard";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { GitPullRequest, FileCode, Inbox } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { AgentConsole } from "@/components/codepulse/agent-console";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { SeverityStackBar } from "@/components/codepulse/charts";
import { ChartSkeleton, ListSkeleton } from "@/components/codepulse/skeletons";
import { SeverityBadge, SeverityDot } from "@/components/codepulse/severity";
import { EmptyState } from "@/components/codepulse/empty-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  aggregateTopFiles,
  api,
  apiBaseUrl,
  buildWeeklySeverityForRepo,
  getProposedCodeFixesForRepoFile,
  getReviews,
} from "@/lib/api";
import { normalizeSeverity } from "@/lib/severity";
import type { Severity } from "@/lib/severity";
import type { ReviewIssue } from "@/types/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/repos/$owner/$repo")({
  beforeLoad: () => ensureLoggedIn(),
  head: ({ params }) => ({
    meta: [{ title: `${params.owner}/${params.repo} · CodePulse` }],
  }),
  component: RepoPage,
});

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low"];

function sortIssuesBySeverity(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => {
    const sa = normalizeSeverity(a.severity);
    const sb = normalizeSeverity(b.severity);
    return SEV_ORDER.indexOf(sa) - SEV_ORDER.indexOf(sb);
  });
}

function RepoSelector({ owner, repo }: { owner: string; repo: string }) {
  const router = useRouter();
  const reposQ = useQuery({ queryKey: ["repos"], queryFn: api.repos });

  if (!reposQ.data || reposQ.data.length <= 1) {
    return null;
  }

  const current = `${owner}/${repo}`;

  return (
    <label className="flex items-center gap-2 text-xs text-zinc-500">
      <span className="hidden sm:inline">Repository</span>
      <select
        value={current}
        onChange={(e) => {
          const slash = e.target.value.indexOf("/");
          if (slash === -1) return;
          const nextOwner = e.target.value.slice(0, slash);
          const nextRepo = e.target.value.slice(slash + 1);
          void router.navigate({
            to: "/repos/$owner/$repo",
            params: { owner: nextOwner, repo: nextRepo },
          });
        }}
        className="max-w-[min(100vw-2rem,280px)] cursor-pointer truncate rounded-md border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-sm font-medium text-zinc-100 focus:border-zinc-600 focus:outline-none"
      >
        {reposQ.data.map((r) => (
          <option key={r.id} value={`${r.owner}/${r.name}`}>
            {r.owner}/{r.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function RepoPage() {
  const { owner, repo } = Route.useParams();
  const repoQ = useQuery({ queryKey: ["repo", owner, repo], queryFn: () => api.repo(owner, repo) });
  const pullsQ = useQuery({
    queryKey: ["pulls", owner, repo],
    queryFn: () => api.pullsFor(`${owner}/${repo}`),
  });
  const reviewsQ = useQuery({ queryKey: ["reviews", "repo", owner, repo], queryFn: getReviews });

  const [expandedPrId, setExpandedPrId] = useState<string | null>(null);
  const [fixDrawerPath, setFixDrawerPath] = useState<string | null>(null);

  const fixesQ = useQuery({
    queryKey: ["proposed-fixes", owner, repo, fixDrawerPath],
    queryFn: () => getProposedCodeFixesForRepoFile(`${owner}/${repo}`, fixDrawerPath!),
    enabled: fixDrawerPath !== null,
  });

  const weekly = useMemo(
    () => (reviewsQ.data ? buildWeeklySeverityForRepo(reviewsQ.data, owner, repo) : []),
    [reviewsQ.data, owner, repo],
  );

  const topFiles = useMemo(
    () => (reviewsQ.data ? aggregateTopFiles(reviewsQ.data, owner, repo) : []),
    [reviewsQ.data, owner, repo],
  );

  const repoFull = `${owner}/${repo}`;

  return (
    <AppShell
      eyebrow="Repository"
      title={`${owner}/${repo}`}
      actions={<RepoSelector owner={owner} repo={repo} />}
    >
      {(repoQ.isError || pullsQ.isError || reviewsQ.isError) && (
        <Panel className="mb-6">
          <p className="text-sm text-red-400">
            Could not load repository data. Is the API running at {apiBaseUrl}?
          </p>
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
              <Metric
                label="Open PRs"
                value={String(repoQ.data.openPRs)}
                pct={(repoQ.data.openPRs / 50) * 100}
              />
              <Metric
                label="Lifetime reviewed"
                value={repoQ.data.reviewed.toLocaleString()}
                pct={80}
              />
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
              {pullsQ.data.map((p) => {
                const review = reviewsQ.data?.find((r) => r.id === p.pullRequestId);
                const issues = review ? sortIssuesBySeverity(review.issues) : [];
                const isExpanded = expandedPrId === p.pullRequestId;

                return (
                  <li key={p.pullRequestId} className="text-left">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setExpandedPrId((prev) =>
                          prev === p.pullRequestId ? null : p.pullRequestId,
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedPrId((prev) =>
                            prev === p.pullRequestId ? null : p.pullRequestId,
                          );
                        }
                      }}
                      className="flex w-full flex-wrap items-start justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-zinc-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090b]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <GitPullRequest className="size-4 shrink-0 text-zinc-500" />
                          <span className="text-sm font-medium text-zinc-100">{p.title}</span>
                          <SeverityBadge severity={p.severity} />
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          #{p.id} opened by{" "}
                          <Link
                            to="/developers/$id"
                            params={{ id: p.authorId }}
                            className="text-zinc-300 hover:text-zinc-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            @{p.author}
                          </Link>{" "}
                          · {p.files} files · +{p.additions} −{p.deletions} · {p.comments} comments
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-wider",
                          isExpanded
                            ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400",
                        )}
                      >
                        {p.state}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-zinc-800/60 bg-black/30 px-4 py-4 sm:px-6">
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-0">
                          <div className="min-h-0 min-w-0 lg:border-r lg:border-orange-500/20 lg:pr-4">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-orange-400">
                              Antigravity trace
                            </p>
                            <AgentConsole pullRequestId={p.pullRequestId} className="h-[350px]" />
                          </div>
                          <div className="min-h-0 min-w-0 lg:pl-4">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-orange-400">
                              Findings
                            </p>
                            <div className="max-h-[350px] space-y-2 overflow-y-auto pr-1">
                              {issues.length === 0 ? (
                                <p className="text-xs text-zinc-500">
                                  No issues recorded for this PR.
                                </p>
                              ) : (
                                issues.map((issue) => (
                                  <div
                                    key={issue.id}
                                    className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-3 ring-1 ring-white/[0.03]"
                                  >
                                    <div className="mb-1 flex flex-wrap items-center gap-2">
                                      <SeverityBadge severity={normalizeSeverity(issue.severity)} />
                                      <span className="font-mono text-[10px] text-zinc-500">
                                        {issue.file}:{issue.line}
                                      </span>
                                    </div>
                                    <p className="text-xs font-medium text-zinc-200">
                                      {issue.title}
                                    </p>
                                    <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-zinc-500">
                                      {issue.explanation}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </div>

      <div className="mt-8">
        <Panel padded={false}>
          <div className="border-b border-zinc-800/60 px-6 py-4">
            <h3 className="text-sm font-medium text-zinc-100">Top files by findings</h3>
            <p className="mt-1 text-xs text-zinc-500">Select a file to compare proposed fixes.</p>
          </div>
          {topFiles.length === 0 ? (
            <p className="px-6 py-6 text-xs text-zinc-500">
              No findings recorded for this repository yet.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {topFiles.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => setFixDrawerPath(f.path)}
                    className="flex w-full items-center justify-between px-6 py-3 text-left text-sm transition-colors hover:bg-zinc-900/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileCode className="size-4 shrink-0 text-orange-400/80" />
                      <span className="truncate font-mono text-xs text-zinc-200">{f.path}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-xs text-zinc-500">
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
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Sheet open={fixDrawerPath !== null} onOpenChange={(open) => !open && setFixDrawerPath(null)}>
        <SheetContent
          side="right"
          className="flex w-full flex-col border-l border-zinc-800 bg-[#09090b] p-0 text-zinc-100 sm:max-w-[min(96vw,960px)]"
        >
          <SheetHeader className="border-b border-zinc-800/80 px-6 py-5 text-left">
            <SheetTitle className="text-lg font-semibold tracking-tight text-zinc-100">
              Proposed fixes{" "}
              <span className="text-orange-400">
                · <span className="font-mono text-base font-normal">{fixDrawerPath}</span>
              </span>
            </SheetTitle>
            <SheetDescription className="text-xs text-zinc-500">
              Split view: original snippet vs agent-suggested change ({repoFull}).
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {fixesQ.isLoading ? (
              <p className="text-sm text-zinc-500">Loading proposed fixes…</p>
            ) : fixesQ.isError ? (
              <p className="text-sm text-red-400">Could not load proposed fixes.</p>
            ) : !fixesQ.data?.length ? (
              <p className="text-sm text-zinc-500">No proposed fixes stored for this path yet.</p>
            ) : (
              <div className="space-y-6">
                {fixesQ.data.map((fix) => (
                  <div
                    key={fix.id}
                    className="overflow-hidden rounded-xl border border-zinc-800 bg-black/40 ring-1 ring-orange-500/10"
                  >
                    <div className="border-b border-zinc-800/80 px-3 py-2 font-mono text-[10px] text-orange-400/90">
                      {fix.lineHunk}
                    </div>
                    <div className="grid grid-cols-1 divide-y divide-zinc-800 md:grid-cols-2 md:divide-x md:divide-y-0">
                      <div className="min-h-[120px] p-3 md:border-r md:border-orange-500/15">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-orange-400">
                          Before
                        </div>
                        <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-800/80 bg-[#050506] p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                          {fix.beforeCode}
                        </pre>
                      </div>
                      <div className="min-h-[120px] p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-orange-400">
                          After
                        </div>
                        <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-orange-500/25 bg-[#050506] p-3 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                          {fix.afterCode}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
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
        <div
          className="h-full rounded-full bg-zinc-300"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
