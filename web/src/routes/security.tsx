import { createFileRoute, Link } from "@tanstack/react-router";
import { ensureLoggedIn } from "@/lib/route-guard";
import { fetchSession, hasInstallation } from "@/lib/auth";
import { InstallAppBanner } from "@/components/codepulse/install-app-banner";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { EmptyState } from "@/components/codepulse/empty-state";
import { ListSkeleton, CardGridSkeleton } from "@/components/codepulse/skeletons";
import { api, type SecurityOverview } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/security")({
  beforeLoad: () => ensureLoggedIn(),
  head: () => ({ meta: [{ title: "Security · CodePulse" }] }),
  component: SecurityPage,
});

function outcomeClass(outcome: string): string {
  switch (outcome) {
    case "allow":
      return "text-emerald-300 bg-emerald-950/50 border-emerald-900";
    case "flag":
      return "text-amber-300 bg-amber-950/50 border-amber-900";
    case "block":
      return "text-red-300 bg-red-950/50 border-red-900";
    default:
      return "text-zinc-300 bg-zinc-900 border-zinc-800";
  }
}

function SecurityPage() {
  const sessionQ = useQuery({ queryKey: ["session"], queryFn: fetchSession });
  const installed = hasInstallation(sessionQ.data);

  const securityQ = useQuery({
    queryKey: ["security"],
    queryFn: api.security,
    enabled: Boolean(sessionQ.data),
  });

  const data: SecurityOverview | undefined = securityQ.data;

  return (
    <AppShell eyebrow="Defense" title="Injection security">
      {!installed ? <InstallAppBanner /> : null}

      {securityQ.isLoading || !data ? (
        <>
          <CardGridSkeleton />
          <ListSkeleton />
        </>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {(["allow", "flag", "block"] as const).map((key) => (
              <Panel key={key}>
                <PanelHeader
                  title={key}
                  hint={data.live.windowDays ? `last ${data.live.windowDays}d` : "live"}
                />
                <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">
                  {data.live.byOutcome[key]}
                </p>
              </Panel>
            ))}
          </div>

          <Panel>
            <PanelHeader
              title="Eval harness catch rates"
              hint="from npm run eval-harness:run → results/latest.json"
            />
            {!data.evalHarness ? (
              <EmptyState
                icon={Shield}
                title="No harness results yet"
                body="Run npm run eval-harness:run in server/ to generate catch/miss metrics by attack category."
              />
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-zinc-400">
                  Overall{" "}
                  <span className="font-medium text-zinc-100">
                    {(data.evalHarness.summary.catchRate * 100).toFixed(0)}%
                  </span>{" "}
                  ({data.evalHarness.summary.caught}/{data.evalHarness.summary.total}) · ran{" "}
                  {new Date(data.evalHarness.ranAt).toLocaleString()}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-md text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-zinc-500">
                      <tr>
                        <th className="pb-2 pr-4 font-medium">Category</th>
                        <th className="pb-2 pr-4 font-medium">Caught</th>
                        <th className="pb-2 font-medium">Catch rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80">
                      {Object.entries(data.evalHarness.byCategory).map(([cat, row]) => (
                        <tr key={cat}>
                          <td className="py-2 pr-4 text-zinc-200">{cat}</td>
                          <td className="py-2 pr-4 tabular-nums text-zinc-300">
                            {row.caught}/{row.total}
                          </td>
                          <td className="py-2 tabular-nums text-zinc-100">
                            {(row.catchRate * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recent decisions" hint="installation-scoped" />
            {data.live.recent.length === 0 ? (
              <EmptyState
                icon={Shield}
                title="No decisions yet"
                body="When the injection gate runs on a review job, outcomes land here."
              />
            ) : (
              <ul className="mt-3 divide-y divide-zinc-800/80">
                {data.live.recent.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide",
                        outcomeClass(row.outcome),
                      )}
                    >
                      {row.outcome}
                    </span>
                    <span className="tabular-nums text-zinc-400">
                      pMal={row.scoreMalicious.toFixed(3)}
                    </span>
                    <span className="truncate text-zinc-500">{row.model}</span>
                    <Link
                      to="/jobs/$jobId"
                      params={{ jobId: row.reviewJobId }}
                      className="ml-auto text-xs text-sky-400 hover:text-sky-300"
                    >
                      Job
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {securityQ.isFetching ? (
        <p className="mt-2 text-xs text-zinc-500">Refreshing…</p>
      ) : null}
    </AppShell>
  );
}
