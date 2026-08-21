import { createFileRoute, Link } from "@tanstack/react-router";
import { ensureLoggedIn } from "@/lib/route-guard";
import { fetchSession, hasInstallation } from "@/lib/auth";
import { InstallAppBanner } from "@/components/codepulse/install-app-banner";
import { useQuery } from "@tanstack/react-query";
import { ListTodo } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { EmptyState } from "@/components/codepulse/empty-state";
import { ListSkeleton, CardGridSkeleton } from "@/components/codepulse/skeletons";
import { api, type JobsOverview } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jobs")({
  beforeLoad: () => ensureLoggedIn(),
  head: () => ({ meta: [{ title: "Jobs · CodePulse" }] }),
  component: JobsPage,
});

function statusClass(status: string): string {
  switch (status) {
    case "queued":
      return "text-sky-300 bg-sky-950/50 border-sky-900";
    case "processing":
      return "text-amber-300 bg-amber-950/50 border-amber-900";
    case "completed":
      return "text-emerald-300 bg-emerald-950/50 border-emerald-900";
    case "failed":
      return "text-orange-300 bg-orange-950/50 border-orange-900";
    case "dead":
      return "text-red-300 bg-red-950/50 border-red-900";
    default:
      return "text-zinc-300 bg-zinc-900 border-zinc-800";
  }
}

function JobsPage() {
  const sessionQ = useQuery({ queryKey: ["session"], queryFn: fetchSession });
  const installed = hasInstallation(sessionQ.data);

  const jobsQ = useQuery({
    queryKey: ["jobs"],
    queryFn: api.jobs,
    enabled: installed,
    refetchInterval: 10_000,
  });

  const data: JobsOverview | undefined = jobsQ.data;

  return (
    <AppShell eyebrow="Pipeline" title="Review jobs">
      {!installed && !sessionQ.isLoading ? <InstallAppBanner /> : null}

      {!installed ? (
        <Panel>
          <p className="text-sm text-zinc-500">
            Install the GitHub App to see queued, failed, and dead-letter review jobs for your
            installation.
          </p>
        </Panel>
      ) : jobsQ.isLoading || !data ? (
        <CardGridSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Queued" value={data.counts.queued} />
            <Stat label="Processing" value={data.counts.processing} />
            <Stat label="Completed" value={data.counts.completed} />
            <Stat label="Failed" value={data.counts.failed} />
            <Stat label="Dead letter" value={data.counts.dead} accent="#ef4444" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <Stat label="Redis waiting" value={data.queue.waiting} />
            <Stat label="Redis active" value={data.queue.active} />
            <Stat label="Redis delayed" value={data.queue.delayed} />
            <Stat label="Redis completed" value={data.queue.completed} />
            <Stat label="Redis failed" value={data.queue.failed} />
          </div>

          <div className="mt-8">
            {data.jobs.length === 0 ? (
              <EmptyState
                icon={ListTodo}
                title="No review jobs yet"
                body="When GitHub delivers a pull-request webhook, CodePulse enqueues a ReviewJob here. Kill the worker to watch jobs sit in queued until it restarts."
              />
            ) : (
              <Panel padded={false}>
                <div className="border-b border-zinc-800/60 px-6 py-4">
                  <PanelHeader title="Recent jobs" hint="Installation-scoped · last 50" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-zinc-800/60 text-[11px] uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-6 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Repo / PR</th>
                        <th className="px-4 py-3 font-medium">Head</th>
                        <th className="px-4 py-3 font-medium">Attempts</th>
                        <th className="px-4 py-3 font-medium">Created</th>
                        <th className="px-4 py-3 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.jobs.map((job) => (
                        <tr key={job.id} className="border-b border-zinc-900/80 text-zinc-300 hover:bg-zinc-900/40">
                          <td className="px-6 py-3">
                            <Link
                              to="/jobs/$jobId"
                              params={{ jobId: job.id }}
                              className="block"
                            >
                              <span
                                className={cn(
                                  "inline-flex rounded border px-2 py-0.5 text-xs font-medium capitalize",
                                  statusClass(job.status),
                                )}
                              >
                                {job.status}
                              </span>
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Link to="/jobs/$jobId" params={{ jobId: job.id }} className="block">
                              <div className="font-medium text-zinc-100 hover:underline">{job.repo}</div>
                              <div className="text-xs text-zinc-500">#{job.prNumber} · view trace</div>
                            </Link>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                            {job.headSha.slice(0, 7)}
                          </td>
                          <td className="px-4 py-3">{job.attempts}</td>
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            {new Date(job.createdAt).toLocaleString()}
                          </td>
                          <td className="max-w-xs truncate px-4 py-3 text-xs text-zinc-500">
                            {job.lastError ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>

          {jobsQ.isFetching ? (
            <p className="mt-4 text-xs text-zinc-600">Refreshing…</p>
          ) : (
            <p className="mt-4 text-xs text-zinc-600">Auto-refreshes every 10s</p>
          )}
        </>
      )}

      {installed && jobsQ.isLoading ? <ListSkeleton /> : null}
    </AppShell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Panel>
      <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-medium tracking-tight text-zinc-100" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
    </Panel>
  );
}
