import { Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Github, LayoutDashboard, LogOut } from "lucide-react";
import { ConnectGitHubButton } from "@/components/codepulse/connect-github-button";
import { fetchSession, signOut } from "@/lib/auth";

export function CodePulseMark({ to = "/" }: { to?: "/" | "/dashboard" }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <span className="grid size-6 place-items-center rounded-sm bg-zinc-100">
        <span className="size-3 rounded-[1px] bg-zinc-950" />
      </span>
      <span className="font-medium tracking-tight text-zinc-100">CodePulse</span>
    </Link>
  );
}

export function SiteNav() {
  const router = useRouter();
  const sessionQ = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });
  const session = sessionQ.data ?? null;

  async function handleSignOut() {
    await signOut();
    await sessionQ.refetch();
    router.navigate({ to: "/", search: {} });
  }

  const logoTo = session ? "/dashboard" : "/";

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-900/60 bg-[#09090b]/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <CodePulseMark to={logoTo} />
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
              >
                <LayoutDashboard className="size-4" />
                Dashboard
              </Link>
              <div className="hidden items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 py-1 pl-1 pr-3 text-xs sm:flex">
                {session.avatarUrl ? (
                  <img
                    src={session.avatarUrl}
                    alt=""
                    className="size-6 rounded-full ring-1 ring-zinc-700"
                  />
                ) : (
                  <Github className="size-3.5 text-zinc-400" />
                )}
                <span className="text-zinc-200">@{session.githubLogin}</span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                <LogOut className="size-3.5" /> Sign out
              </button>
            </>
          ) : (
            <ConnectGitHubButton className="rounded-full bg-zinc-100 py-1.5 pl-2 pr-3 text-sm font-medium text-zinc-900 ring-1 ring-zinc-100 hover:bg-white" />
          )}
        </div>
      </div>
    </nav>
  );
}
