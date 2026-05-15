/** Types for weekly developer digest aggregation and delivery results. */

export type DeveloperDigest = {
  developerId: string;
  githubLogin: string;
  totalIssues: number;
  issuesByCategory: Record<string, number>;
  issuesBySeverity: Record<string, number>;
  topFiles: Array<{ file: string; count: number }>;
  weekStart: Date;
  weekEnd: Date;
};

export type DigestResult = {
  organizationId: string;
  digestsSent: number;
  developerCount: number;
  errors: string[];
  sentAt: string;
};
