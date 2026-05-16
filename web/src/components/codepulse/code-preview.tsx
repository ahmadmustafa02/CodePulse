import { Sparkles } from "lucide-react";
import { SeverityBadge } from "./severity";

export function HeroCodePreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-tr from-zinc-500/10 via-zinc-700/5 to-transparent blur-3xl" />
      <div className="relative overflow-hidden rounded-xl bg-[#18181b] shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/40 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-zinc-800" />
              <span className="size-2.5 rounded-full bg-zinc-800" />
              <span className="size-2.5 rounded-full bg-zinc-800" />
            </div>
            <span className="font-mono text-xs text-zinc-500">your-org/api/src/handlers/charges.ts</span>
          </div>
          <span className="font-mono text-[10px] text-zinc-600">TypeScript · PR #421</span>
        </div>
        <div className="relative overflow-hidden p-6 font-mono text-xs leading-6">
          <CodeLine n={42}>
            <span className="text-zinc-300">async create(params: ChargeCreateParams): Promise&lt;Charge&gt; {"{"}</span>
          </CodeLine>
          <CodeLine n={43}>
            <span className="text-zinc-300">  const {"{"} amount, currency, customer {"}"} = params;</span>
          </CodeLine>
          <CodeLine n={44} highlight>
            <span className="text-zinc-100">  return this.request('POST', '/v1/charges', {"{"} amount, currency {"}"});</span>
          </CodeLine>

          <div className="relative ml-8 mt-4 mb-4 overflow-hidden rounded-lg bg-zinc-900/80 p-4 ring-1 ring-zinc-800">
            <span className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: "#ef4444" }} />
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-5 place-items-center rounded bg-zinc-100 text-zinc-900">
                  <Sparkles className="size-3" />
                </span>
                <span className="text-xs font-medium text-zinc-200">CodePulse Intelligence</span>
              </div>
              <SeverityBadge severity="critical" />
            </div>
            <p className="mb-3 text-zinc-400">
              Missing idempotency key in charge creation. Retrying after a network timeout could create duplicate charges.
            </p>
            <div className="flex gap-2">
              <button className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-medium text-zinc-200 hover:bg-zinc-700">Apply Fix</button>
              <button className="px-2 py-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-300">Dismiss</button>
            </div>
          </div>

          <CodeLine n={45}>
            <span className="text-zinc-300">{"}"}</span>
          </CodeLine>
        </div>
      </div>
    </div>
  );
}

function CodeLine({ n, children, highlight }: { n: number; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div
      className={
        highlight
          ? "-mx-6 flex gap-4 border-l-2 border-[#ef4444] bg-[#ef4444]/10 px-6"
          : "flex gap-4 opacity-60"
      }
    >
      <span className="w-4 text-right text-zinc-600">{n}</span>
      {children}
    </div>
  );
}