/** API types for repository details and agent execution traces. */

import type { DeploymentState } from '@prisma/client';

export type RepositoryDetails = {
  id: string;
  name: string;
  fullName: string;
  private: boolean;
  deploymentState: DeploymentState;
  lastIncidentPr: string | null;
  pullRequestCount: number;
  totalIssues: number;
  lastReviewedAt: string | null;
  lastReviewIssueCount: number;
  status: string;
};

export type AgentTraceRecord = {
  id: string;
  prNumber: number;
  repositoryId: string;
  agentName: string;
  message: string;
  status: string;
  createdAt: string;
};
