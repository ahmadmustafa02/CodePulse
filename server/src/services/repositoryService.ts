/** Repository lookups and AgentTrace queries for the repos API. */

import type { Repository } from '@prisma/client';
import type { AgentTraceRecord, RepositoryDetails } from '../types/repository';
import logger from '../utils/logger';
import { prisma } from './prismaService';

function toRepositoryDetails(repo: Repository & {
  pullRequests: {
    updatedAt: Date;
    _count: { issues: number };
  }[];
  _count: { pullRequests: number };
}): RepositoryDetails {
  const lastReview = repo.pullRequests[0];
  const totalIssues = repo.pullRequests.reduce((sum, pr) => sum + pr._count.issues, 0);

  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.fullName,
    private: repo.private,
    deploymentState: repo.deploymentState,
    lastIncidentPr: repo.lastIncidentPr,
    pullRequestCount: repo._count.pullRequests,
    totalIssues,
    lastReviewedAt: lastReview?.updatedAt.toISOString() ?? null,
    lastReviewIssueCount: lastReview?._count.issues ?? 0,
    status: lastReview ? 'active' : 'pending',
  };
}

const repositoryInclude = {
  pullRequests: {
    include: { _count: { select: { issues: true } } },
    orderBy: { updatedAt: 'desc' as const },
  },
  _count: { select: { pullRequests: true } },
} as const;

export async function findRepositoryBySlug(
  organizationId: string,
  owner: string,
  repo: string,
): Promise<(Repository & {
  pullRequests: { updatedAt: Date; _count: { issues: number } }[];
  _count: { pullRequests: number };
}) | null> {
  const fullName = `${owner}/${repo}`;

  return prisma.repository.findFirst({
    where: { organizationId, fullName },
    include: repositoryInclude,
  });
}

export async function getRepositoryDetails(
  organizationId: string,
  owner: string,
  repo: string,
): Promise<RepositoryDetails | null> {
  const repository = await findRepositoryBySlug(organizationId, owner, repo);

  if (!repository) {
    logger.info('Repository not found for organization', { organizationId, fullName: `${owner}/${repo}` });
    return null;
  }

  return toRepositoryDetails(repository);
}

export async function getAgentTraces(
  repositoryId: string,
  prNumber?: number,
): Promise<AgentTraceRecord[]> {
  const traces = await prisma.agentTrace.findMany({
    where: {
      repositoryId,
      ...(prNumber !== undefined ? { prNumber } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });

  return traces.map((trace) => ({
    id: trace.id,
    prNumber: trace.prNumber,
    repositoryId: trace.repositoryId,
    agentName: trace.agentName,
    message: trace.message,
    status: trace.status,
    createdAt: trace.createdAt.toISOString(),
  }));
}
