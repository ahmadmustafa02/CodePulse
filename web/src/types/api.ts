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
