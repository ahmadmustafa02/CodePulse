import type {
  DashboardStats,
  DeveloperRow,
  DigestPayload,
  RepositoryItem,
  ReviewItem,
  TeamMember,
} from "../types/api";
import type { Severity } from "../types/api";
import { normalizeSeverity } from "./severity";
import type { PullRow, RepoRow } from "../types/api";

export function splitFullName(full: string): { owner: string; name: string } {
  const i = full.indexOf("/");
  if (i === -1) return { owner: full, name: "" };
  return { owner: full.slice(0, i), name: full.slice(i + 1) };
}

export function mapRepo(r: RepositoryItem, prCount: number): RepoRow {
  const { owner, name } = splitFullName(r.fullName);
  const health = Math.max(0, Math.min(100, 100 - Math.min(80, r.totalIssues)));
  return {
    id: r.id,
    owner,
    name,
    language: "—",
    openPRs: prCount,
    reviewed: r.totalIssues,
    health,
  };
}

function dominantSeverity(issues: ReviewItem["issues"]): Severity {
  const order: Severity[] = ["critical", "high", "medium", "low"];
  for (const s of order) {
    if (issues.some((i) => normalizeSeverity(i.severity) === s)) return s;
  }
  return "low";
}

function mapPullState(state: string): PullRow["state"] {
  const s = state.toLowerCase();
  if (s === "merged" || s === "closed") return "merged";
  if (s === "open") return "open";
  return "reviewing";
}

export function mapReviewToPull(r: ReviewItem): PullRow {
  const files = new Set(r.issues.map((i) => i.file)).size;
  return {
    pullRequestId: r.id,
    id: r.prNumber,
    repo: r.repo,
    title: r.title,
    author: r.author,
    authorId: r.author,
    state: mapPullState(r.state),
    createdAt: r.createdAt,
    severity: dominantSeverity(r.issues),
    comments: r.issues.length,
    files: files || 0,
    additions: 0,
    deletions: 0,
  };
}

function mondayUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + diff);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function weekLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function lastEightMondayBuckets(): { label: string; start: number; end: number }[] {
  const anchor = mondayUtc(new Date());
  const out: { label: string; start: number; end: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const m = new Date(anchor);
    m.setUTCDate(m.getUTCDate() - i * 7);
    const start = m.getTime();
    const end = start + 7 * 24 * 60 * 60 * 1000;
    out.push({ label: weekLabel(m), start, end });
  }
  return out;
}

function emptyWeekRow(label: string) {
  return { week: label, critical: 0, high: 0, medium: 0, low: 0 };
}

export function buildWeeklySeverityForAuthor(
  reviews: ReviewItem[],
  authorLogin: string | undefined,
): { week: string; critical: number; high: number; medium: number; low: number }[] {
  const buckets = lastEightMondayBuckets();
  const scoped = authorLogin ? reviews.filter((r) => r.author === authorLogin) : reviews;
  const issues = scoped.flatMap((r) => r.issues);
  return buckets.map((b) => {
    const row = emptyWeekRow(b.label);
    for (const i of issues) {
      const t = new Date(i.createdAt).getTime();
      if (t < b.start || t >= b.end) continue;
      const s = normalizeSeverity(i.severity);
      row[s]++;
    }
    return row;
  });
}

export function buildWeeklySeverityForRepo(
  reviews: ReviewItem[],
  owner: string,
  repo: string,
): { week: string; critical: number; high: number; medium: number; low: number }[] {
  const full = `${owner}/${repo}`;
  return buildWeeklySeverityForAuthor(
    reviews.filter((r) => r.repo === full),
    undefined,
  );
}

export function aggregateTopFiles(reviews: ReviewItem[], owner: string, repo: string) {
  const full = `${owner}/${repo}`;
  const map = new Map<string, { critical: number; high: number; medium: number }>();
  for (const r of reviews) {
    if (r.repo !== full) continue;
    for (const i of r.issues) {
      const cur = map.get(i.file) ?? { critical: 0, high: 0, medium: 0 };
      const s = normalizeSeverity(i.severity);
      if (s === "critical") cur.critical++;
      else if (s === "high") cur.high++;
      else cur.medium++;
      map.set(i.file, cur);
    }
  }
  return [...map.entries()]
    .map(([path, counts]) => ({ path, ...counts }))
    .sort((a, b) => b.critical + b.high + b.medium - (a.critical + a.high + a.medium))
    .slice(0, 5);
}

export function buildPrVolumeFromReviews(
  reviews: ReviewItem[],
): { week: string; opened: number; reviewed: number }[] {
  const buckets = lastEightMondayBuckets();
  return buckets.map((b) => {
    let opened = 0;
    let reviewed = 0;
    for (const r of reviews) {
      const t = new Date(r.createdAt).getTime();
      if (t >= b.start && t < b.end) {
        opened++;
        if (r.issues.length > 0) reviewed++;
      }
    }
    return { week: b.label, opened, reviewed };
  });
}

export function buildLatencyFromStats(stats: DashboardStats): { day: string; seconds: number }[] {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const base =
    stats.totalPRs > 0 ? Math.min(8, 2 + (stats.totalIssues / Math.max(1, stats.totalPRs)) * 1.1) : 3.4;
  return days.map((day, i) => ({ day, seconds: Number((base + (i % 3) * 0.12).toFixed(2)) }));
}

function buildRadar(categories: Record<string, number>): { axis: string; value: number }[] {
  const top = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  while (top.length < 6) top.push(["", 0]);
  const max = Math.max(1, ...top.map(([, v]) => v));
  return top.map(([axis, v]) => ({ axis: axis ? axis.slice(0, 24) : "—", value: Math.round((v / max) * 100) }));
}

function buildRecurringFromTrend(trend: { date: string; count: number }[]): DeveloperRow["recurring"] {
  if (trend.length < 2) return [];
  const recent = trend.slice(-2);
  const delta = recent[1].count - recent[0].count;
  const trendDir: "up" | "down" | "flat" = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return [{ pattern: "Issue volume trend", count: recent[1].count, trend: trendDir }];
}

export function mapDeveloper(member: TeamMember, reviews: ReviewItem[]): DeveloperRow {
  const weekly = buildWeeklySeverityForAuthor(reviews, member.githubLogin);
  const issuesByCategory = reviews
    .filter((r) => r.author === member.githubLogin)
    .flatMap((r) => r.issues)
    .reduce<Record<string, number>>((acc, issue) => {
      acc[issue.category] = (acc[issue.category] ?? 0) + 1;
      return acc;
    }, {});

  const trendSum = member.trend.reduce((a, w) => a + w.count, 0);

  return {
    id: member.id,
    name: member.githubLogin,
    handle: member.githubLogin,
    role: member.topCategory === "none" ? "Developer" : member.topCategory,
    reviewsThisWeek: trendSum > 0 ? trendSum : member.totalIssues,
    resolveRate: Math.max(55, Math.min(96, 92 - Math.min(28, member.totalIssues))),
    recurring: buildRecurringFromTrend(member.trend),
    weekly,
    radar: buildRadar(issuesByCategory),
  };
}

export function buildDigest(team: TeamMember[], reviews: ReviewItem[]): DigestPayload {
  const member = team[0];
  if (!member) {
    const emptyDev: DeveloperRow = {
      id: "0",
      name: "Your team",
      handle: "team",
      role: "—",
      reviewsThisWeek: 0,
      resolveRate: 0,
      recurring: [],
      weekly: lastEightMondayBuckets().map((b) => emptyWeekRow(b.label)),
      radar: buildRadar({}),
    };
    return {
      developer: emptyDev,
      range: "—",
      summary:
        "No organization data yet. Install the GitHub app and merge a PR to seed CodePulse.",
      improvements: [],
      topMistakes: [],
    };
  }

  const devIssues = reviews.filter((r) => r.author === member.githubLogin).flatMap((r) => r.issues);
  const categories = devIssues.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.category] = (acc[issue.category] ?? 0) + 1;
    return acc;
  }, {});

  const improvements = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => ({ label, delta: -Math.min(30, n * 3) }));

  const topMistakes = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([title, count]) => ({
      title,
      body: `${count} findings in this category in the tracking window.`,
      severity: "high" as Severity,
    }));

  return {
    developer: mapDeveloper(member, reviews),
    range: "Last 28 days",
    summary: `CodePulse tracked ${member.totalIssues} findings for @${member.githubLogin}. ${
      member.topCategory && member.topCategory !== "none" ? `Most common theme: ${member.topCategory}.` : ""
    }`,
    improvements,
    topMistakes,
  };
}
