/** Read-only analytics queries for dashboard API endpoints. */

import { prisma } from './prismaService';
import logger from '../utils/logger';

export async function getOrganizationIdByInstallationId(
  installationId: number,
): Promise<string | null> {
  const organization = await prisma.organization.findUnique({
    where: { githubInstallationId: installationId },
    select: { id: true },
  });

  if (organization) {
    return organization.id;
  }

  const fallback = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, githubInstallationId: true },
  });

  if (fallback) {
    logger.warn('Organization not found for installation ID; using first org as fallback', {
      requestedInstallationId: installationId,
      fallbackInstallationId: fallback.githubInstallationId,
      organizationId: fallback.id,
    });
    return fallback.id;
  }

  return null;
}

export async function getDashboardStats(organizationId: string) {
  const [
    totalPRs,
    totalIssues,
    criticalIssues,
    issuesByCategory,
    issuesBySeverity,
    pullRequests,
    allPullRequests,
  ] = await Promise.all([
    prisma.pullRequest.count({ where: { organizationId } }),
    prisma.issue.count({ where: { organizationId } }),
    prisma.issue.count({ where: { organizationId, severity: 'critical' } }),
    prisma.issue.groupBy({
      by: ['category'],
      where: { organizationId },
      _count: { category: true },
    }),
    prisma.issue.groupBy({
      by: ['severity'],
      where: { organizationId },
      _count: { severity: true },
    }),
    prisma.pullRequest.findMany({
      where: { organizationId },
      include: {
        developer: true,
        repository: true,
        _count: { select: { issues: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.pullRequest.findMany({
      where: { organizationId },
      include: { _count: { select: { issues: true } } },
    }),
  ]);

  const cleanPRs = allPullRequests.filter((pr) => pr._count.issues === 0).length;

  return {
    totalPRs,
    totalIssues,
    criticalIssues,
    cleanPRs,
    issuesByCategory: issuesByCategory.map((row) => ({
      category: row.category,
      count: row._count.category,
    })),
    issuesBySeverity: issuesBySeverity.map((row) => ({
      severity: row.severity,
      count: row._count.severity,
    })),
    recentReviews: pullRequests.map((pr) => ({
      id: pr.id,
      title: pr.title,
      prNumber: pr.prNumber,
      repo: pr.repository.fullName,
      author: pr.developer.githubLogin,
      issueCount: pr._count.issues,
      updatedAt: pr.updatedAt.toISOString(),
    })),
  };
}

export async function getRepositories(organizationId: string) {
  logger.info('getRepositories: querying by organizationId', { organizationId });

  const repositories = await prisma.repository.findMany({
    where: { organizationId },
    include: {
      pullRequests: {
        include: { _count: { select: { issues: true } } },
        orderBy: { updatedAt: 'desc' },
      },
      _count: { select: { pullRequests: true } },
    },
    orderBy: { fullName: 'asc' },
  });

  logger.info('getRepositories: repositories in DB for organization', {
    organizationId,
    repositoryCount: repositories.length,
    repositories: repositories.map((repo) => ({
      id: repo.id,
      fullName: repo.fullName,
      pullRequestCount: repo._count.pullRequests,
    })),
  });

  return repositories.map((repo) => {
    const lastReview = repo.pullRequests[0];
    const totalIssues = repo.pullRequests.reduce((sum, pr) => sum + pr._count.issues, 0);

    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.fullName,
      private: repo.private,
      pullRequestCount: repo._count.pullRequests,
      totalIssues,
      lastReviewedAt: lastReview?.updatedAt.toISOString() ?? null,
      lastReviewIssueCount: lastReview?._count.issues ?? 0,
      status: lastReview ? 'active' : 'pending',
    };
  });
}

export async function getReviews(organizationId: string) {
  const pullRequests = await prisma.pullRequest.findMany({
    where: { organizationId },
    include: {
      developer: true,
      repository: true,
      issues: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  return pullRequests.map((pr) => {
    const severityBreakdown = pr.issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.severity] = (acc[issue.severity] ?? 0) + 1;
      return acc;
    }, {});

    return {
      id: pr.id,
      title: pr.title,
      prNumber: pr.prNumber,
      repo: pr.repository.fullName,
      author: pr.developer.githubLogin,
      authorAvatar: pr.developer.avatarUrl,
      headSha: pr.headSha,
      state: pr.state,
      createdAt: pr.createdAt.toISOString(),
      issueCount: pr.issues.length,
      severityBreakdown,
      issues: pr.issues.map((issue) => ({
        id: issue.id,
        file: issue.file,
        line: issue.line,
        category: issue.category,
        severity: issue.severity,
        title: issue.title,
        explanation: issue.explanation,
        suggestion: issue.suggestion,
        codeSnippet: issue.codeSnippet,
        createdAt: issue.createdAt.toISOString(),
      })),
      updatedAt: pr.updatedAt.toISOString(),
    };
  });
}

export async function getTeam(organizationId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 28);

  const developers = await prisma.developer.findMany({
    where: { organizationId },
    include: {
      issues: {
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { githubLogin: 'asc' },
  });

  return developers.map((developer) => {
    const issuesByCategory = developer.issues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.category] = (acc[issue.category] ?? 0) + 1;
      return acc;
    }, {});

    const topCategory =
      Object.entries(issuesByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';

    const issuesByWeek = developer.issues.reduce<Record<string, number>>((acc, issue) => {
      const weekKey = issue.createdAt.toISOString().slice(0, 10);
      acc[weekKey] = (acc[weekKey] ?? 0) + 1;
      return acc;
    }, {});

    const trend = Object.entries(issuesByWeek)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      id: developer.id,
      githubLogin: developer.githubLogin,
      avatarUrl: developer.avatarUrl,
      totalIssues: developer.issues.length,
      topCategory,
      trend,
    };
  });
}
