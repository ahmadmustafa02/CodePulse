import { createFileRoute, Link } from "@tanstack/react-router";
import { GitBranch, LineChart, Mail, ShieldCheck, Smartphone, Sparkles, Wrench } from "lucide-react";
import { ConnectGitHubButton } from "@/components/codepulse/connect-github-button";
import { SiteNav } from "@/components/codepulse/site-nav";
import { HeroCodePreview } from "@/components/codepulse/code-preview";
import { SeverityStackBar } from "@/components/codepulse/charts";
import { Panel } from "@/components/codepulse/panel";
import { redirectIfLoggedIn } from "@/lib/route-guard";
import { defaultLandingSearch } from "@/lib/constants";

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
      { title: "CodePulse — AI agent orchestration for PR review" },
      {
        name: "description",
        content:
          "Agent swarm reviews every PR, posts inline GitHub feedback, suggests fixes, learns developer habits, escalates critical findings, and delivers weekly coaching digests — powered by Google Antigravity.",
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
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">⚡ POWERED BY GOOGLE ANTIGRAVITY</span>
            </div>
            <h1 className="mb-6 text-balance text-4xl font-medium leading-tight tracking-tight text-zinc-100 md:text-5xl lg:text-6xl">
              AI Agent Orchestration that reviews, escalates, and coaches.
            </h1>
            <p className="mb-10 max-w-[48ch] text-pretty text-lg leading-relaxed text-zinc-400">
              A PR opens. The agent swarm wakes up, reviews the code like a senior engineer, posts inline GitHub feedback, suggests before-and-after fixes, learns each developer's habits, escalates critical findings by email to Team Lead, and coaches the team with a weekly learning digest.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ConnectGitHubButton
                showArrow
                label="Sign in with GitHub"
                className="rounded-md bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 ring-1 ring-zinc-100 hover:bg-white"
              />
              {/* TODO: replace # with demo video URL once recorded */}
              <a
                href="#"
                className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800"
              >
                Watch 3-min demo
              </a>
            </div>
            {/* TODO: replace # with Android app distribution URL once available */}
            <p className="mt-3 text-sm text-zinc-500">
              <a href="#" className="underline-offset-4 hover:text-zinc-300 hover:underline">
                Get the Android app
              </a>
            </p>
          </div>

          <div className="lg:col-span-7">
            <HeroCodePreview />
          </div>
        </div>
      </section>

      <section className="border-y border-zinc-900/60 bg-zinc-900/20 py-12">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
          {[
            { v: "5 agents", l: "Specialized AI roles per PR" },
            { v: "<3 min", l: "PR open to inline feedback" },
            { v: "One-click fixes", l: "Before-and-after diffs" },
            { v: "Weekly digests", l: "Personalized per developer" },
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
            <h2 className="mb-4 text-3xl font-medium tracking-tight text-zinc-100">How CodePulse thinks</h2>
            <p className="text-zinc-400">
              Five autonomous agents. One transparent reasoning loop. Powered by Google Antigravity.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <FeatureCard icon={Sparkles} title="@Orchestrator decides" body="The Orchestrator autonomously picks which tools to call — triage, habit lookup, deep review, escalation. No hardcoded pipeline. Every decision is logged." />
            <FeatureCard icon={GitBranch} title="@Triager prioritizes" body="Ranks every file by risk in milliseconds. Lockfiles and generated code are skipped. Only meaningful changes reach the reviewer." />
            <FeatureCard icon={LineChart} title="@HabitAnalyzer learns" body="Queries each developer's history of past issues. The review focuses on patterns this specific engineer tends to repeat." />
            <FeatureCard icon={ShieldCheck} title="@ReviewerSwarm analyzes" body="Deep semantic review per chunk. Critical, High, Medium, Low findings with exact line numbers and suggested fixes. Posted inline on GitHub." />
            <FeatureCard icon={Mail} title="@Escalator notifies" body="Critical findings — credential leaks, SQL injection, auth bypass — automatically alert the team lead by email and surface on the dashboard." />
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 max-w-[56ch]">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-zinc-600">Visualized</p>
            <h2 className="mb-4 text-3xl font-medium tracking-tight text-zinc-100">Every decision, traceable.</h2>
            <p className="text-zinc-400">
              CodePulse exposes its agent reasoning in real-time. Watch the Orchestrator decide. See tool calls happen. Audit every escalation. This isn't a black-box reviewer — it's a transparent teammate.
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
                <Reason icon={Sparkles} title="Antigravity-native" body="Built on Google Antigravity's Interactions API with session chaining and environment-scoped agents. The reasoning loop runs on Antigravity, not in our TypeScript." />
                <Reason icon={Wrench} title="Tool-driven autonomy" body="The agent chooses which of five registered tools to call, in what order, based on what it learns at each step." />
                <Reason icon={Smartphone} title="Mobile-native" body="Generate a device token, paste it into the Android app, see every PR analysis and agent trace from your phone." />
              </ul>
            </Panel>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-900/60 py-12 text-center">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-widest text-zinc-600">Protected by SOC2 Type II</p>
        <p className="mb-4 text-xs text-zinc-600">Built with Google Antigravity</p>
        <div className="flex justify-center gap-6 text-xs text-zinc-500">
          <Link to="/" search={defaultLandingSearch} className="hover:text-zinc-300">Privacy</Link>
          <Link to="/" search={defaultLandingSearch} className="hover:text-zinc-300">Terms</Link>
          <Link to="/" search={defaultLandingSearch} className="hover:text-zinc-300">Security</Link>
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

