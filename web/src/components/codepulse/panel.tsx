import { cn } from "@/lib/utils";

export function Panel({ children, className, padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={cn("rounded-xl bg-[#18181b] ring-1 ring-white/5", padded && "p-6", className)}>
      {children}
    </div>
  );
}

export function PanelHeader({ title, action, hint }: { title: string; action?: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-medium text-zinc-100">{title}</h3>
        {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}