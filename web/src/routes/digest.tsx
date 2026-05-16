import { createFileRoute } from "@tanstack/react-router";
import { ensureLoggedIn } from "@/lib/route-guard";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpen, Mail } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { Panel } from "@/components/codepulse/panel";
import { ListSkeleton } from "@/components/codepulse/skeletons";
import { SeverityBadge } from "@/components/codepulse/severity";
import { api } from "@/lib/api";

export const Route = createFileRoute("/digest")({
  beforeLoad: () => ensureLoggedIn(),
  head: () => ({
    meta: [
      { title: "Weekly digest · CodePulse" },
      { name: "description", content: "Your personalized weekly learning digest from CodePulse." },
    ],
  }),
  component: DigestPage,
});

function DigestPage() {
  const q = useQuery({ queryKey: ["digest"], queryFn: api.digest });

  return (
    <AppShell eyebrow="Weekly digest preview" title="Email going out Monday at 9:00 am">
      {q.isLoading || !q.data ? (
        <ListSkeleton rows={6} />
      ) : (
        <Panel padded={false} className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/40 px-6 py-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Mail className="size-3.5" /> digest@codepulse.dev → {q.data.developer.handle}@example.com
            </div>
            <span className="text-xs text-zinc-500">{q.data.range}</span>
          </div>
          <div className="px-8 py-8">
            <h2 className="text-xl font-medium text-zinc-100">
              Hey {q.data.developer.name.split(" ")[0]}, here's your week in code.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{q.data.summary}</p>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {q.data.improvements.map((i) => (
                <div key={i.label} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">{i.label}</div>
                  <div
                    className="mt-1 flex items-center gap-1 text-lg font-medium"
                    style={{ color: i.delta < 0 ? "#22c55e" : "#ef4444" }}
                  >
                    {i.delta < 0 ? <ArrowDown className="size-4" /> : <ArrowUp className="size-4" />}
                    {Math.abs(i.delta)}%
                  </div>
                </div>
              ))}
            </div>

            <h3 className="mt-8 text-xs font-medium uppercase tracking-widest text-zinc-500">Top patterns this week</h3>
            <ul className="mt-4 space-y-5">
              {q.data.topMistakes.map((m) => (
                <li key={m.title} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-medium text-zinc-100">{m.title}</h4>
                    <SeverityBadge severity={m.severity} />
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-400">{m.body}</p>
                  {m.resource && (
                    <a
                      href={m.resource.href}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-200 hover:text-white"
                    >
                      <BookOpen className="size-3.5" /> {m.resource.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-10 border-t border-zinc-800/60 pt-6 text-center text-[11px] text-zinc-600">
              You're getting this because you're a member of <span className="text-zinc-400">your-org</span>. Adjust cadence in settings.
            </div>
          </div>
        </Panel>
      )}
    </AppShell>
  );
}