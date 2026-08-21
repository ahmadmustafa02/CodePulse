import { createFileRoute, Link } from "@tanstack/react-router";
import { ensureLoggedIn } from "@/lib/route-guard";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, AlertTriangle, ListTodo } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { EmptyState } from "@/components/codepulse/empty-state";
import { ListSkeleton } from "@/components/codepulse/skeletons";
import { api, type JobTraceEvent } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/jobs/$jobId")({
  beforeLoad: () => ensureLoggedIn(),
  head: () => ({ meta: [{ title: "Job trace · CodePulse" }] }),
  component: JobTracePage,
});

function jobStatusClass(status: string): string {
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

function stepStatusClass(status: string): string {
  switch (status) {
    case "started":
      return "text-sky-300 bg-sky-950/50 border-sky-900";
    case "completed":
      return "text-emerald-300 bg-emerald-950/50 border-emerald-900";
    case "failed":
      return "text-red-300 bg-red-950/50 border-red-900";
    default:
      return "text-zinc-300 bg-zinc-900 border-zinc-800";
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function JobTracePage() {
  const { jobId } = Route.useParams();
  const traceQ = useQuery({
    queryKey: ["job-trace", jobId],
    queryFn: () => api.jobTrace(jobId),
    retry: false,
  });

  if (traceQ.isLoading) {
    return (
      <AppShell eyebrow="Pipeline" title="Job trace">
        <ListSkeleton />
      </AppShell>
    );
  }

  if (traceQ.isError || !traceQ.data) {
    return (
      <AppShell
        eyebrow="Pipeline"
        title="Job not found"
        actions={
          <Link to="/jobs" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
            <ArrowLeft className="size-3.5" />
            Back to jobs
          </Link>
        }
      >
        <EmptyState
          icon={ListTodo}
          title="Job not found"
          body="That job does not exist for your installation, or you do not have access to its trace."
        />
      </AppShell>
    );
  }

  const { job, events } = traceQ.data;

  return (
    <AppShell
      eyebrow="Pipeline"
      title={`${job.repo} #${job.prNumber}`}
      actions={
        <Link to="/jobs" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="size-3.5" />
          Back to jobs
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Panel>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Status</p>
          <span
            className={cn(
              "mt-2 inline-flex rounded border px-2 py-0.5 text-xs font-medium capitalize",
              jobStatusClass(job.status),
            )}
          >
            {job.status}
          </span>
        </Panel>
        <Panel>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Attempts</p>
          <p className="mt-2 text-2xl font-medium text-zinc-100">{job.attempts}</p>
        </Panel>
        <Panel>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Head</p>
          <p className="mt-2 font-mono text-sm text-zinc-200">{job.headSha.slice(0, 12)}</p>
        </Panel>
        <Panel>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Steps</p>
          <p className="mt-2 text-2xl font-medium text-zinc-100">{events.length}</p>
        </Panel>
      </div>

      {job.lastError ? (
        <Panel className="mt-4 border border-red-900/40 bg-red-950/20">
          <p className="text-[11px] uppercase tracking-wider text-red-400/80">Last error</p>
          <p className="mt-2 text-sm text-red-200/90">{job.lastError}</p>
        </Panel>
      ) : null}

      <div className="mt-8">
        <Panel padded={false}>
          <div className="border-b border-zinc-800/60 px-6 py-4">
            <PanelHeader
              title="Trace timeline"
              hint="Ordered by startedAt · first failed step flagged as likely root cause"
            />
          </div>
          {events.length === 0 ? (
            <div className="px-6 py-10 text-sm text-zinc-500">No TraceEvents recorded for this job yet.</div>
          ) : (
            <ul className="divide-y divide-zinc-900/80">
              {events.map((event) => (
                <TraceRow key={event.id} event={event} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function TraceRow({ event }: { event: JobTraceEvent }) {
  const [open, setOpen] = useState(event.likelyRootCause || event.status === "failed");

  return (
    <li className={cn(event.likelyRootCause && "bg-red-950/15")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-6 py-3.5 text-left hover:bg-zinc-900/40"
      >
        <span className="mt-0.5 text-zinc-500">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-zinc-100">{event.step}</span>
            <span
              className={cn(
                "inline-flex rounded border px-2 py-0.5 text-[11px] font-medium capitalize",
                stepStatusClass(event.status),
              )}
            >
              {event.status}
            </span>
            {event.attempt !== null ? (
              <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">
                attempt {event.attempt}
              </span>
            ) : null}
            {event.likelyRootCause ? (
              <span className="inline-flex items-center gap-1 rounded border border-red-800/60 bg-red-950/40 px-2 py-0.5 text-[11px] font-medium text-red-300">
                <AlertTriangle className="size-3" />
                Likely root cause
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>Duration {formatDuration(event.durationMs)}</span>
            <span>{new Date(event.startedAt).toLocaleString()}</span>
          </div>
        </div>
      </button>
      {open ? (
        <div className="border-t border-zinc-900/60 bg-zinc-950/40 px-6 py-3 pl-14">
          {event.metadata && Object.keys(event.metadata).length > 0 ? (
            <pre className="overflow-x-auto rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 text-xs text-zinc-400">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-zinc-600">No metadata on this step.</p>
          )}
        </div>
      ) : null}
    </li>
  );
}
