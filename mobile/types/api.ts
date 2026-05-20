export type Severity = "critical" | "high" | "medium" | "low";

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type UserSession = {
  githubLogin: string;
  avatarUrl: string | null;
  installationId: number | null;
};

export type DashboardStats = {
  totalPRs: number;
  totalIssues: number;
  criticalIssues: number;
  cleanPRs: number;
  issuesByCategory: { category: string; count: number }[];
  issuesBySeverity: { severity: string; count: number }[];
  recentReviews: {
    id: string;
    title: string;
    prNumber: number;
    repo: string;
    author: string;
    issueCount: number;
    updatedAt: string;
  }[];
};

export type RepositoryItem = {
  id: string;
  name: string;
  fullName: string;
  private: boolean;
  pullRequestCount: number;
  totalIssues: number;
  lastReviewedAt: string | null;
  lastReviewIssueCount: number;
  status: string;
};

export type ReviewIssue = {
  id: string;
  file: string;
  line: number;
  category: string;
  severity: string;
  title: string;
  explanation: string;
  suggestion: string;
  codeSnippet: string;
  createdAt: string;
};

export type ReviewItem = {
  id: string;
  title: string;
  prNumber: number;
  repo: string;
  author: string;
  authorAvatar: string | null;
  headSha: string;
  state: string;
  createdAt: string;
  issueCount: number;
  severityBreakdown: Record<string, number>;
  issues: ReviewIssue[];
  updatedAt: string;
};

export type TeamMember = {
  id: string;
  githubLogin: string;
  avatarUrl: string | null;
  totalIssues: number;
  topCategory: string;
  trend: { date: string; count: number }[];
};

export type AntigravityAgent = "@Triager" | "@HabitAnalyzer" | "@ReviewerSwarm" | "@Orchestrator";

export type AgentTraceLogEntry = {
  timestamp: string;
  kind: "session" | "transition" | "step" | "thought" | "tool";
  agent: AntigravityAgent;
  message: string;
  meta?: Record<string, unknown>;
};

export type AgentTracePollPayload = {
  logs: AgentTraceLogEntry[];
  traceId: string | null;
  fetchedAt: string;
};

export type DigestPreferences = {
  digestEmailEnabled: boolean;
  hasEmail: boolean;
};

export type RecentAntigravityTraceFeedItem = {
  traceId: string;
  pullRequestId: string;
  prNumber: number;
  prTitle: string;
  repoFullName: string;
  statusLine: string;
  sessionStartedAt: string;
};

export type EscalationRecord = {
  id: string;
  file: string;
  line: number;
  category: string;
  summary: string;
  justification: string;
  created_at: string;
  status: "pending" | "notified";
};

export type RepoRow = {
  id: string;
  owner: string;
  name: string;
  language: string;
  openPRs: number;
  reviewed: number;
  health: number;
};

export type PullRow = {
  pullRequestId: string;
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

export type DeveloperRow = {
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

export type DigestPayload = {
  developer: DeveloperRow;
  range: string;
  summary: string;
  improvements: { label: string; delta: number }[];
  topMistakes: {
    title: string;
    body: string;
    severity: Severity;
    resource?: { label: string; href: string };
  }[];
};
