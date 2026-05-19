import { createFileRoute } from "@tanstack/react-router";
import { ensureLoggedIn } from "@/lib/route-guard";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BookOpen, Mail } from "lucide-react";
import { AppShell } from "@/components/codepulse/app-shell";
import { Panel } from "@/components/codepulse/panel";
import { ListSkeleton } from "@/components/codepulse/skeletons";
import { SeverityBadge } from "@/components/codepulse/severity";
import { Switch } from "@/components/ui/switch";
import { api, getDigestPreferences, updateDigestPreferences } from "@/lib/api";

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
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["digest"], queryFn: api.digest });
  const prefs = useQuery({ queryKey: ["digest-preferences"], queryFn: getDigestPreferences });

  const togglePrefs = useMutation({
    mutationFn: (enabled: boolean) => updateDigestPreferences(enabled),
    onSuccess: (data) => {
      queryClient.setQueryData(["digest-preferences"], data);
    },
  });

  const emailEnabled = prefs.data?.digestEmailEnabled ?? false;
  const hasEmail = prefs.data?.hasEmail ?? false;

  return (
    <AppShell eyebrow="Weekly digest preview" title="Sunday digest · 9:00 UTC">
      {q.isLoading || !q.data || prefs.isLoading ? (
        <ListSkeleton rows={6} />
      ) : (
        <div className="mx-auto max-w-2xl space-y-4">
            <Panel className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-zinc-100">Get weekly email</div>
                <p className="mt-1 text-xs text-zinc-500">
                  {emailEnabled
                    ? "You will receive your personalized digest each Sunday when you have review findings."
                    : "Turn on to receive your weekly learning digest by email."}
                </p>
                {!hasEmail && (
                  <p className="mt-2 text-xs text-amber-500/90">
                    Sign in with GitHub using an account that shares your email (user:email scope) to enable
                    delivery.
                  </p>
                )}
              </div>
              <Switch
                checked={emailEnabled}
                disabled={togglePrefs.isPending || !hasEmail}
                onCheckedChange={(checked) => togglePrefs.mutate(checked)}
                aria-label="Get weekly digest email"
              />
            </Panel>

            <Panel padded={false}>
              <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/40 px-6 py-4">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Mail className="size-3.5" />
                  {emailEnabled ? "Scheduled delivery" : "Preview only"} · @{q.data.developer.handle}
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

                <h3 className="mt-8 text-xs font-medium uppercase tracking-widest text-zinc-500">
                  Top patterns this week
                </h3>
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
                  {emailEnabled
                    ? "Weekly emails are enabled for your account."
                    : "Enable “Get weekly email” above to receive this digest each Sunday."}
                </div>
              </div>
            </Panel>
        </div>
      )}
    </AppShell>
  );
}
