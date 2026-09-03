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

export type ReviewJobItem = {
  id: string;
  repo: string;
  prNumber: number;
  headSha: string;
  status: string;
  attempts: number;
  lastError: string | null;
  deliveryId: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type JobTraceEvent = {
  id: string;
  step: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  attempt: number | null;
  likelyRootCause: boolean;
  metadata: Record<string, unknown> | null;
};

export type JobTraceView = {
  job: Omit<ReviewJobItem, "deliveryId">;
  events: JobTraceEvent[];
};

export type JobsOverview = {
  counts: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
    dead: number;
  };
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  jobs: ReviewJobItem[];
};

export type SecurityOverview = {
  installed: boolean;
  live: {
    windowDays?: number;
    total: number;
    byOutcome: { allow: number; flag: number; block: number };
    recent: Array<{
      id: string;
      outcome: string;
      scoreMalicious: number;
      scoreSafe: number;
      model: string;
      createdAt: string;
      reviewJobId: string;
    }>;
  };
  evalHarness: {
    version: number;
    ranAt: string;
    summary: {
      total: number;
      caught: number;
      missed: number;
      catchRate: number;
    };
    byCategory: Record<string, { total: number; caught: number; catchRate: number }>;
  } | null;
};
