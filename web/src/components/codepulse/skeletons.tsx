import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "./panel";

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <Panel>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-4 w-40 bg-zinc-800" />
        <Skeleton className="h-4 w-24 bg-zinc-800" />
      </div>
      <Skeleton className="w-full bg-zinc-900" style={{ height }} />
    </Panel>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Panel>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-md bg-zinc-800" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-2/3 bg-zinc-800" />
              <Skeleton className="h-3 w-1/3 bg-zinc-900" />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Panel key={i}>
          <Skeleton className="mb-3 h-3 w-1/2 bg-zinc-800" />
          <Skeleton className="h-7 w-2/3 bg-zinc-900" />
        </Panel>
      ))}
    </div>
  );
}