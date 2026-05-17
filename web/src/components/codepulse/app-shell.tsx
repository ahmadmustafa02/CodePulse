import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Github,
  LayoutDashboard,
  GitPullRequest,
  Users,
  Mail,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { CodePulseMark } from "./site-nav";
import { fetchSession, hasInstallation, signOut } from "@/lib/auth";
import { api, type DeveloperRow, type RepoRow } from "@/lib/api";
import { ConnectGitHubButton } from "@/components/codepulse/connect-github-button";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  match: string;
};

function repoNavTo(pathname: string, repos: RepoRow[] | undefined): string {
  const onRepo = pathname.match(/^\/repos\/[^/]+\/[^/]+/);
  if (onRepo) return pathname;
  const first = repos?.[0];
  return first ? `/repos/${first.owner}/${first.name}` : "/dashboard";
}

function developerNavTo(pathname: string, developers: DeveloperRow[] | undefined): string {
  const onDev = pathname.match(/^\/developers\/([^/]+)/);
  if (onDev) return pathname;
  const first = developers?.[0];
  return first ? `/developers/${first.id}` : "/dashboard";
}

function buildNav(pathname: string, repos: RepoRow[] | undefined, developers: DeveloperRow[] | undefined): NavItem[] {
  return [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: "/dashboard" },
    {
      to: repoNavTo(pathname, repos),
      label: "Repositories",
      icon: GitPullRequest,
      match: "/repos",
    },
    {
      to: developerNavTo(pathname, developers),
      label: "Developers",
      icon: Users,
      match: "/developers",
    },
    { to: "/digest", label: "Weekly digest", icon: Mail, match: "/digest" },
    { to: "/settings", label: "Settings", icon: SettingsIcon, match: "/settings" },
  ];
}

export function AppShell({
  children,
  title,
  eyebrow,
  actions,
}: {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const { pathname } = useLocation();

  const sessionQ = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });

  const session = sessionQ.data ?? null;
  const installed = hasInstallation(session);

  const reposQ = useQuery({
    queryKey: ["repos"],
    queryFn: api.repos,
    staleTime: 5 * 60 * 1000,
    enabled: installed,
  });

  const developersQ = useQuery({
    queryKey: ["developers"],
    queryFn: api.developers,
    staleTime: 5 * 60 * 1000,
    enabled: installed,
  });
  const nav = buildNav(pathname, reposQ.data, developersQ.data);

  async function handleSignOut() {
    await signOut();
    router.navigate({ to: "/", search: {} });
  }

  return (
    <div className="min-h-screen bg-[#09090b] font-sans text-zinc-400">
      <header className="sticky top-0 z-40 border-b border-zinc-900/60 bg-[#09090b]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-6">
            <CodePulseMark to={session ? "/dashboard" : "/"} />
            <span className="hidden text-[11px] uppercase tracking-widest text-zinc-600 md:inline">
              Console
            </span>
          </div>
          <div className="flex items-center gap-3">
            {session ? (
              <>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                >
                  <LayoutDashboard className="size-3.5" />
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
              <ConnectGitHubButton className="rounded-full bg-zinc-100 py-1 pl-2 pr-3 text-xs font-medium text-zinc-900" />
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1400px] gap-8 px-4 py-8 md:px-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-0.5">
            {nav.map((item) => {
              const active = pathname.startsWith(item.match);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-zinc-900 text-zinc-100"
                      : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300"
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {(eyebrow || title || actions) && (
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                {eyebrow && (
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-zinc-600">
                    {eyebrow}
                  </p>
                )}
                {title && (
                  <h1 className="text-2xl font-medium tracking-tight text-zinc-100 md:text-3xl">
                    {title}
                  </h1>
                )}
              </div>
              {actions}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
