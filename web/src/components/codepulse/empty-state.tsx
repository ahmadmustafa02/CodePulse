import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-16 text-center">
      <div className="mb-4 grid size-10 place-items-center rounded-lg bg-zinc-900 ring-1 ring-zinc-800">
        <Icon className="size-5 text-zinc-500" />
      </div>
      <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-zinc-500">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}