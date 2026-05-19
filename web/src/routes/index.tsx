import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, GitBranch, LineChart, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { ConnectGitHubButton } from "@/components/codepulse/connect-github-button";
import { SiteNav } from "@/components/codepulse/site-nav";
import { HeroCodePreview } from "@/components/codepulse/code-preview";
import { SeverityStackBar } from "@/components/codepulse/charts";
import { Panel } from "@/components/codepulse/panel";
import { redirectIfLoggedIn } from "@/lib/route-guard";

const DEMO_WEEKLY_SEVERITY = [
  { week: "Week 1", critical: 3, high: 8, medium: 12, low: 5 },
  { week: "Week 2", critical: 2, high: 6, medium: 15, low: 8 },
  { week: "Week 3", critical: 5, high: 10, medium: 9, low: 6 },
  { week: "Week 4", critical: 1, high: 4, medium: 11, low: 9 },
] as const;

const DEMO_REPOS = ["your-org/api", "your-org/frontend"] as const;

export const Route = createFileRoute("/")({
  beforeLoad: () => redirectIfLoggedIn(),
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  head: () => ({
    meta: [
      { title: "CodePulse — AI Code review that gets personal" },
      {
        name: "description",
        content:
          "Automatic AI PR reviews on GitHub with inline feedback, mistake-pattern tracking per developer, and weekly personalized learning digests.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { error } = Route.useSearch();

  return (
    <div className="min-h-screen bg-[#09090b] font-sans text-zinc-400 selection:bg-zinc-500/30">
      <SiteNav />
      {error === "oauth_failed" ? (
        <p className="mx-auto max-w-7xl px-6 pt-4 text-sm text-red-400">
          GitHub sign-in did not complete. Please try again.
        </p>
      ) : error === "install_failed" ? (
        <p className="mx-auto max-w-7xl px-6 pt-4 text-sm text-red-400">
          GitHub installation did not complete. Please try connecting again.
        </p>
      ) : null}

      <section className="relative overflow-hidden pb-32 pt-20">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1 ring-1 ring-zinc-800">
              <span className="size-1.5 animate-pulse rounded-full" style={{ backgroundColor: "#eab308" }} />
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">v2.4 context engine live</span>
            </div>
            <h1 className="mb-6 text-balance text-4xl font-medium leading-tight tracking-tight text-zinc-100 md:text-5xl lg:text-6xl">
              AI Code review that gets personal.
            </h1>
            <p className="mb-10 max-w-[48ch] text-pretty text-lg leading-relaxed text-zinc-400">
              CodePulse reviews every PR automatically, posts inline feedback on the exact lines in GitHub, tracks each developer's mistake patterns, and sends a weekly learning digest tailored to them.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ConnectGitHubButton
                showArrow
                className="rounded-md bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 ring-1 ring-zinc-100 hover:bg-white"
              />
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800"
              >
                View live demo
              </Link>
            </div>
          </div>

          <div className="lg:col-span-7">
            <HeroCodePreview />
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-900/60 bg-zinc-900/20 py-12">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
          {[
            { v: "4.2s", l: "Avg review time" },
            { v: "18k+", l: "Patterns analyzed" },
            { v: "99.4%", l: "Actionable rate" },
            { v: "Zero", l: "Config required" },
          ].map((s) => (
            <div key={s.l}>
              <div className="mb-1 text-2xl font-medium text-zinc-100">{s.v}</div>
              <div className="text-xs font-medium uppercase tracking-widest text-zinc-500">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 max-w-[56ch]">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-zinc-600">How it works</p>
            <h2 className="mb-4 text-3xl font-medium tracking-tight text-zinc-100">Four moving parts. One feedback loop.</h2>
            <p className="text-zinc-400">
              CodePulse connects to GitHub once, then runs quietly in the background. Every PR is reviewed, every comment is filed under the developer who wrote it, and every Monday the lessons come back as a digest.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FeatureCard icon={GitBranch} title="Reviews every PR" body="Triggered the moment a PR opens. No webhooks to babysit, no extra CI step to maintain." />
            <FeatureCard icon={Sparkles} title="Inline GitHub comments" body="Feedback lands on the exact line â€” same UX as a human reviewer, with severity tagged." />
            <FeatureCard icon={LineChart} title="Mistake-pattern tracking" body="Recurring issues are grouped per developer so you can spot growth areas, not nitpicks." />
            <FeatureCard icon={Mail} title="Weekly learning digest" body="Personalized email every Monday with the top patterns and one resource per mistake." />
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 max-w-[56ch]">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-zinc-600">Visualized</p>
            <h2 className="mb-4 text-3xl font-medium tracking-tight text-zinc-100">Mistake patterns, not noise</h2>
            <p className="text-zinc-400">
              CodePulse doesn't just list issues. It surfaces recurring architectural weaknesses across your team â€” the kind of feedback that only a senior reviewer with 18 months of context could give.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Panel>
                <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-zinc-300">Weekly severity distribution</span>
                      <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        Demo data
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-600">{DEMO_REPOS.join(" · ")}</p>
                  </div>
                  <Legend />
                </div>
                <SeverityStackBar data={[...DEMO_WEEKLY_SEVERITY]} />
              </Panel>
            </div>
            <Panel>
              <h3 className="mb-6 text-sm font-medium text-zinc-100">Context awareness</h3>
              <ul className="space-y-6">
                <Reason icon={ShieldCheck} title="Domain knowledge" body="Understands your specific API versioning and internal libraries." />
                <Reason icon={Sparkles} title="Semantic search" body="Indexes every PR to find similar mistakes across history." />
                <Reason icon={BookOpen} title="Collaborative tuning" body="Refines its rules based on team feedback to reduce noise over time." />
              </ul>
            </Panel>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-900/60 py-12 text-center">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-widest text-zinc-600">Protected by SOC2 Type II</p>
        <div className="flex justify-center gap-6 text-xs text-zinc-500">
          <Link to="/" className="hover:text-zinc-300">Privacy</Link>
          <Link to="/" className="hover:text-zinc-300">Terms</Link>
          <Link to="/" className="hover:text-zinc-300">Security</Link>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, body }: { icon: typeof GitBranch; title: string; body: string }) {
  return (
    <Panel>
      <div className="mb-4 grid size-8 place-items-center rounded-lg border border-zinc-800 bg-zinc-900">
        <Icon className="size-4 text-zinc-300" />
      </div>
      <h3 className="mb-2 text-sm font-medium text-zinc-100">{title}</h3>
      <p className="text-xs leading-relaxed text-zinc-500">{body}</p>
    </Panel>
  );
}

function Reason({ icon: Icon, title, body }: { icon: typeof GitBranch; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-zinc-800 bg-zinc-900">
        <Icon className="size-4 text-zinc-500" />
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-zinc-300">{title}</div>
        <p className="text-[11px] leading-normal text-zinc-500">{body}</p>
      </div>
    </li>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3">
      {([
        ["critical", "#ef4444"],
        ["high", "#f97316"],
        ["medium", "#eab308"],
        ["low", "#22c55e"],
      ] as const).map(([l, c]) => (
        <span key={l} className="flex items-center gap-1.5 text-[10px] font-medium uppercase text-zinc-500">
          <span className="size-2 rounded-full" style={{ backgroundColor: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

