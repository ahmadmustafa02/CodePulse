export type Severity = "critical" | "high" | "medium" | "low";

export const severityColor: Record<Severity, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

export type Repo = {
  id: string;
  owner: string;
  name: string;
  language: string;
  openPRs: number;
  reviewed: number;
  health: number;
};

export const repos: Repo[] = [
  { id: "1", owner: "stripe", name: "stripe-node", language: "TypeScript", openPRs: 12, reviewed: 184, health: 94 },
  { id: "2", owner: "vercel", name: "next.js", language: "TypeScript", openPRs: 38, reviewed: 612, health: 88 },
  { id: "3", owner: "tailwindlabs", name: "tailwindcss", language: "JavaScript", openPRs: 7, reviewed: 121, health: 96 },
  { id: "4", owner: "your-org", name: "api-gateway", language: "Go", openPRs: 4, reviewed: 58, health: 81 },
];

export type PullRequest = {
  id: number;
  repo: string;
  title: string;
  author: string;
  authorId: string;
  state: "open" | "merged" | "reviewing";
  createdAt: string;
  severity: Severity;
  comments: number;
  files: number;
  additions: number;
  deletions: number;
};

export const pulls: PullRequest[] = [
  { id: 421, repo: "stripe/stripe-node", title: "feat: add idempotency key to charge endpoint", author: "sarah_dev", authorId: "u1", state: "reviewing", createdAt: "2026-05-14T10:21:00Z", severity: "critical", comments: 6, files: 4, additions: 142, deletions: 38 },
  { id: 402, repo: "stripe/stripe-node", title: "fix: race condition in auth middleware", author: "sarah_dev", authorId: "u1", state: "open", createdAt: "2026-05-13T09:02:00Z", severity: "critical", comments: 4, files: 2, additions: 31, deletions: 19 },
  { id: 398, repo: "vercel/next.js", title: "perf: stream S3 uploads instead of buffering", author: "mike_eng", authorId: "u2", state: "open", createdAt: "2026-05-12T16:48:00Z", severity: "high", comments: 9, files: 7, additions: 318, deletions: 102 },
  { id: 411, repo: "vercel/next.js", title: "refactor: extract user profile loader", author: "alex_codes", authorId: "u3", state: "merged", createdAt: "2026-05-11T11:15:00Z", severity: "medium", comments: 3, files: 5, additions: 96, deletions: 41 },
  { id: 76, repo: "tailwindlabs/tailwindcss", title: "docs: clarify arbitrary variant precedence", author: "lin_park", authorId: "u4", state: "merged", createdAt: "2026-05-10T08:30:00Z", severity: "low", comments: 1, files: 1, additions: 12, deletions: 3 },
  { id: 215, repo: "your-org/api-gateway", title: "feat: rate-limit middleware with token bucket", author: "alex_codes", authorId: "u3", state: "open", createdAt: "2026-05-09T14:05:00Z", severity: "high", comments: 5, files: 6, additions: 207, deletions: 14 },
  { id: 207, repo: "your-org/api-gateway", title: "chore: bump otel-go to 1.28", author: "mike_eng", authorId: "u2", state: "merged", createdAt: "2026-05-08T07:42:00Z", severity: "low", comments: 0, files: 9, additions: 88, deletions: 71 },
];

export type Developer = {
  id: string;
  name: string;
  handle: string;
  role: string;
  reviewsThisWeek: number;
  resolveRate: number;
  recurring: { pattern: string; count: number; trend: "up" | "down" | "flat" }[];
  weekly: { week: string; critical: number; high: number; medium: number; low: number }[];
  radar: { axis: string; value: number }[];
};

export const developers: Developer[] = [
  {
    id: "u1",
    name: "Sarah Chen",
    handle: "sarah_dev",
    role: "Senior Backend Engineer",
    reviewsThisWeek: 14,
    resolveRate: 82,
    recurring: [
      { pattern: "Missing idempotency on side-effectful endpoints", count: 7, trend: "down" },
      { pattern: "Race conditions in shared session state", count: 5, trend: "flat" },
      { pattern: "Unbounded Promise.all over user input", count: 3, trend: "down" },
    ],
    weekly: weeks().map((w, i) => ({
      week: w,
      critical: [3, 2, 4, 2, 1, 2, 1, 1][i],
      high: [5, 4, 6, 5, 3, 4, 2, 3][i],
      medium: [8, 7, 6, 6, 5, 4, 5, 4][i],
      low: [12, 10, 11, 9, 8, 9, 7, 6][i],
    })),
    radar: [
      { axis: "Concurrency", value: 72 },
      { axis: "Error handling", value: 58 },
      { axis: "Type safety", value: 88 },
      { axis: "Tests", value: 64 },
      { axis: "Perf", value: 70 },
      { axis: "Security", value: 81 },
    ],
  },
  {
    id: "u2",
    name: "Mike Alvarez",
    handle: "mike_eng",
    role: "Staff Engineer",
    reviewsThisWeek: 22,
    resolveRate: 91,
    recurring: [
      { pattern: "Unhandled stream errors in upload paths", count: 4, trend: "flat" },
      { pattern: "Implicit any in adapter layer", count: 3, trend: "down" },
      { pattern: "Missing context cancellation in workers", count: 2, trend: "up" },
    ],
    weekly: weeks().map((w, i) => ({
      week: w,
      critical: [1, 1, 0, 2, 1, 0, 1, 0][i],
      high: [3, 4, 3, 2, 3, 2, 2, 2][i],
      medium: [5, 6, 4, 5, 4, 3, 4, 3][i],
      low: [8, 9, 7, 6, 7, 5, 6, 5][i],
    })),
    radar: [
      { axis: "Concurrency", value: 84 },
      { axis: "Error handling", value: 76 },
      { axis: "Type safety", value: 70 },
      { axis: "Tests", value: 82 },
      { axis: "Perf", value: 88 },
      { axis: "Security", value: 79 },
    ],
  },
  {
    id: "u3",
    name: "Alex Doan",
    handle: "alex_codes",
    role: "Backend Engineer",
    reviewsThisWeek: 9,
    resolveRate: 74,
    recurring: [
      { pattern: "N+1 queries in profile loaders", count: 6, trend: "down" },
      { pattern: "Missing pagination on list endpoints", count: 4, trend: "flat" },
      { pattern: "Tests skipped instead of fixed", count: 3, trend: "up" },
    ],
    weekly: weeks().map((w, i) => ({
      week: w,
      critical: [2, 1, 2, 1, 2, 1, 1, 1][i],
      high: [4, 5, 4, 3, 4, 3, 3, 2][i],
      medium: [9, 8, 7, 8, 6, 7, 6, 5][i],
      low: [11, 10, 9, 10, 9, 8, 8, 7][i],
    })),
    radar: [
      { axis: "Concurrency", value: 55 },
      { axis: "Error handling", value: 62 },
      { axis: "Type safety", value: 71 },
      { axis: "Tests", value: 48 },
      { axis: "Perf", value: 66 },
      { axis: "Security", value: 68 },
    ],
  },
  {
    id: "u4",
    name: "Lin Park",
    handle: "lin_park",
    role: "Frontend Engineer",
    reviewsThisWeek: 17,
    resolveRate: 89,
    recurring: [
      { pattern: "Effect cleanup missing for event listeners", count: 3, trend: "down" },
      { pattern: "Inaccessible interactive divs", count: 2, trend: "flat" },
    ],
    weekly: weeks().map((w, i) => ({
      week: w,
      critical: [0, 1, 0, 0, 1, 0, 0, 0][i],
      high: [2, 3, 2, 2, 1, 2, 1, 1][i],
      medium: [4, 5, 4, 3, 4, 3, 3, 2][i],
      low: [6, 7, 5, 6, 5, 5, 4, 4][i],
    })),
    radar: [
      { axis: "Concurrency", value: 60 },
      { axis: "Error handling", value: 74 },
      { axis: "Type safety", value: 86 },
      { axis: "Tests", value: 71 },
      { axis: "Perf", value: 78 },
      { axis: "Security", value: 70 },
    ],
  },
];

function weeks(): string[] {
  return ["Mar 24", "Mar 31", "Apr 7", "Apr 14", "Apr 21", "Apr 28", "May 5", "May 12"];
}

export const reviewLatency = [
  { day: "Mon", seconds: 4.2 },
  { day: "Tue", seconds: 3.8 },
  { day: "Wed", seconds: 5.1 },
  { day: "Thu", seconds: 4.4 },
  { day: "Fri", seconds: 4.9 },
  { day: "Sat", seconds: 3.1 },
  { day: "Sun", seconds: 2.8 },
];

export const prVolume = weeks().map((w, i) => ({
  week: w,
  opened: [42, 38, 51, 47, 44, 49, 53, 58][i],
  reviewed: [40, 36, 49, 46, 43, 48, 52, 57][i],
}));

export type AIComment = {
  id: string;
  prId: number;
  file: string;
  line: number;
  severity: Severity;
  message: string;
  suggestion?: string;
};

export const comments: AIComment[] = [
  {
    id: "c1",
    prId: 421,
    file: "src/resources/Charges.ts",
    line: 44,
    severity: "critical",
    message:
      "Missing idempotency key in charge creation. Retrying after a network timeout could create duplicate charges.",
    suggestion: "this.request('POST', '/v1/charges', { amount, currency }, { idempotencyKey })",
  },
  {
    id: "c2",
    prId: 421,
    file: "src/resources/Charges.ts",
    line: 71,
    severity: "medium",
    message: "Response type widened to `any`. Consider narrowing to `Charge` to preserve downstream type-safety.",
  },
  {
    id: "c3",
    prId: 421,
    file: "test/charges.test.ts",
    line: 12,
    severity: "low",
    message: "Test description doesn't match the assertion. Update copy to reflect the idempotency case.",
  },
];

export type DigestItem = {
  title: string;
  body: string;
  severity: Severity;
  resource?: { label: string; href: string };
};

export const weeklyDigest = {
  developer: developers[0],
  range: "May 5 – May 12, 2026",
  summary:
    "You shipped 18 PRs this week. CodePulse caught 4 critical issues — the same idempotency pattern showed up in 3 of them. Here's what to focus on next week.",
  improvements: [
    { label: "Concurrency bugs", delta: -32 },
    { label: "Type-safety lapses", delta: -18 },
    { label: "Missing tests", delta: 6 },
  ],
  topMistakes: [
    {
      title: "Idempotency on side-effectful endpoints",
      body:
        "Three charge-creation PRs were missing idempotency keys. Adopt the new `withIdempotency()` helper before merging similar handlers.",
      severity: "critical" as Severity,
      resource: { label: "Stripe idempotency guide", href: "#" },
    },
    {
      title: "Race conditions in shared session state",
      body:
        "Two PRs mutated session objects without atomic updates. Prefer `atomicSessionUpdate(id, patch)` over read-modify-write loops.",
      severity: "high" as Severity,
      resource: { label: "Internal RFC 014", href: "#" },
    },
    {
      title: "Unbounded Promise.all over user input",
      body:
        "Batching unbounded user input through Promise.all can exhaust memory under spikes. Cap with `pMap` and a concurrency limit.",
      severity: "medium" as Severity,
    },
  ] satisfies DigestItem[],
};