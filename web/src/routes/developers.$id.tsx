import { createFileRoute, Link } from "@tanstack/react-router";
import { ensureLoggedIn } from "@/lib/route-guard";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp, Minus, UserX } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { Panel, PanelHeader } from "@/components/codepulse/panel";
import { MistakeRadar, SeverityStackBar } from "@/components/codepulse/charts";
import { ChartSkeleton, ListSkeleton } from "@/components/codepulse/skeletons";
import { EmptyState } from "@/components/codepulse/empty-state";
import { api } from "@/lib/api";

export const Route = createFileRoute("/developers/$id")({
  beforeLoad: () => ensureLoggedIn(),
  head: ({ params }) => ({ meta: [{ title: `Developer · CodePulse` }, { name: "description", content: `Mistake patterns and review history for ${params.id}.` }] }),
  component: DeveloperPage,
});

function DeveloperPage() {
  const { id } = Route.useParams();
  const dev = useQuery({ queryKey: ["dev", id], queryFn: () => api.developer(id) });
  const allDevs = useQuery({ queryKey: ["devs"], queryFn: api.developers });

  if (dev.isLoading) {
    return (
      <AppShell eyebrow="Developer profile" title=" ">
        <ChartSkeleton />
      </AppShell>
    );
  }

  if (!dev.data) {
    return (
      <AppShell eyebrow="Developer profile" title="Not found">
        <EmptyState icon={UserX} title="Developer not found" body="That profile doesn't exist or hasn't been indexed yet." />
      </AppShell>
    );
  }

  const d = dev.data;

  return (
    <AppShell eyebrow="Developer profile" title={d.name}
      actions={
        <div className="flex items-center gap-2">
          {allDevs.data?.map((x) => (
            <Link
              key={x.id}
              to="/developers/$id"
              params={{ id: x.id }}
              className={
                x.id === d.id
                  ? "rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900"
                  : "rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800"
              }
            >
              @{x.handle}
            </Link>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Panel>
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-900">
              {d.name.split(" ").map((p) => p[0]).join("")}
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-100">@{d.handle}</div>
              <div className="text-xs text-zinc-500">{d.role}</div>
            </div>
          </div>
        </Panel>
        <Panel>
          <div className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Reviews this week</div>
          <div className="mt-2 text-2xl font-medium text-zinc-100">{d.reviewsThisWeek}</div>
        </Panel>
        <Panel>
          <div className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">Resolve rate</div>
          <div className="mt-2 text-2xl font-medium text-zinc-100">{d.resolveRate}%</div>
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel>
            <PanelHeader title="Findings by week" hint="Stacked by severity" />
            <SeverityStackBar data={d.weekly} />
          </Panel>
        </div>
        <Panel>
          <PanelHeader title="Skill radar" hint="Higher is stronger" />
          <MistakeRadar data={d.radar} />
        </Panel>
      </div>

      <div className="mt-6">
        <Panel padded={false}>
          <div className="border-b border-zinc-800/60 px-6 py-4">
            <h3 className="text-sm font-medium text-zinc-100">Recurring mistake patterns</h3>
          </div>
          {d.recurring.length === 0 ? (
            <ListSkeleton />
          ) : (
            <ul className="divide-y divide-zinc-800/60">
              {d.recurring.map((m) => (
                <li key={m.pattern} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-zinc-200">{m.pattern}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">{m.count} occurrences in the last 8 weeks</div>
                  </div>
                  <Trend trend={m.trend} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function Trend({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "down")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#22c55e" }}>
        <TrendingDown className="size-3.5" /> Improving
      </span>
    );
  if (trend === "up")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#ef4444" }}>
        <TrendingUp className="size-3.5" /> Worsening
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500">
      <Minus className="size-3.5" /> Flat
    </span>
  );
}