/** Database service layer: all Prisma operations for organizations, PRs, and issues. */

import type { AgentTrace, Developer, Issue, Organization, PullRequest, Repository, RepositorySettings, User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger';
import { prisma } from './prismaService';

type UpsertOrganizationParams = {
  githubInstallationId: number;
  name: string;
};

type UpsertRepositoryParams = {
  githubRepoId: number;
  name: string;
  fullName: string;
  private: boolean;
  organizationId: string;
};

type UpsertDeveloperParams = {
  githubLogin: string;
  githubUserId: number;
  avatarUrl?: string;
  organizationId: string;
};

type UpsertPullRequestParams = {
  githubPrId: number;
  prNumber: number;
  title: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  organizationId: string;
  repositoryId: string;
  developerId: string;
};

type CreateIssueInput = {
  file: string;
  line: number;
  category: string;
  severity: string;
  title: string;
  explanation: string;
  suggestion: string;
  codeSnippet: string;
  organizationId: string;
  pullRequestId: string;
  developerId: string;
};

type DeveloperPattern = {
  developerId: string;
  category: string;
  count: number;
};

type UpsertUserParams = {
  githubLogin: string;
  githubUserId: bigint;
  avatarUrl?: string | null;
  email?: string | null;
};

export class DatabaseService {
  async upsertUser(params: UpsertUserParams): Promise<User> {
    const emailUpdate =
      params.email && params.email.trim().length > 0 ? { email: params.email.trim() } : {};

    const user = await prisma.user.upsert({
      where: { githubUserId: params.githubUserId },
      update: {
        githubLogin: params.githubLogin,
        avatarUrl: params.avatarUrl ?? null,
        ...emailUpdate,
        updatedAt: new Date(),
      },
      create: {
        githubLogin: params.githubLogin,
        githubUserId: params.githubUserId,
        avatarUrl: params.avatarUrl ?? null,
        email: params.email?.trim() || null,
      },
    });

    logger.info('User upserted', { githubLogin: user.githubLogin, userId: user.id });
    return user;
  }

  async findUserByGithubUserId(githubUserId: bigint): Promise<User | null> {
    return prisma.user.findUnique({ where: { githubUserId } });
  }

  async getDigestPreferences(githubUserId: bigint): Promise<{
    digestEmailEnabled: boolean;
    hasEmail: boolean;
  } | null> {
    const user = await prisma.user.findUnique({
      where: { githubUserId },
      select: { digestEmailEnabled: true, email: true },
    });
    if (!user) {
      return null;
    }
    const email = user.email?.trim();
    return {
      digestEmailEnabled: user.digestEmailEnabled,
      hasEmail: Boolean(email && email.length > 0),
    };
  }

  async setDigestEmailEnabled(githubUserId: bigint, enabled: boolean): Promise<User> {
    const user = await prisma.user.update({
      where: { githubUserId },
      data: { digestEmailEnabled: enabled, updatedAt: new Date() },
    });
    logger.info('Digest email preference updated', {
      githubLogin: user.githubLogin,
      digestEmailEnabled: enabled,
    });
    return user;
  }

  async updateUserInstallationId(githubUserId: bigint, installationId: number): Promise<User> {
    const user = await prisma.user.update({
      where: { githubUserId },
      data: { installationId, updatedAt: new Date() },
    });
    logger.info('User installation ID updated', {
      githubLogin: user.githubLogin,
      installationId,
    });
    return user;
  }

  async upsertOrganization(params: UpsertOrganizationParams): Promise<Organization> {
    const organization = await prisma.organization.upsert({
      where: { githubInstallationId: params.githubInstallationId },
      update: { name: params.name, updatedAt: new Date() },
      create: {
        name: params.name,
        githubInstallationId: params.githubInstallationId,
      },
    });

    logger.info('Organization upserted', {
      installationId: params.githubInstallationId,
      organizationId: organization.id,
    });

    return organization;
  }

  async ensureOrganizationForInstallation(installationId: number, name = 'unknown'): Promise<Organization> {
    return this.upsertOrganization({
      githubInstallationId: installationId,
      name,
    });
  }

  async upsertRepository(params: UpsertRepositoryParams): Promise<Repository> {
    const repository = await prisma.repository.upsert({
      where: { githubRepoId: BigInt(params.githubRepoId) },
      update: {
        name: params.name,
        fullName: params.fullName,
        private: params.private,
        organizationId: params.organizationId,
        updatedAt: new Date(),
      },
      create: {
        githubRepoId: BigInt(params.githubRepoId),
        name: params.name,
        fullName: params.fullName,
        private: params.private,
        organizationId: params.organizationId,
      },
    });

    logger.info('Repository upserted', { fullName: params.fullName, repositoryId: repository.id });
    return repository;
  }

  async upsertDeveloper(params: UpsertDeveloperParams): Promise<Developer> {
    const developer = await prisma.developer.upsert({
      where: {
        githubLogin_organizationId: {
          githubLogin: params.githubLogin,
          organizationId: params.organizationId,
        },
      },
      update: {
        avatarUrl: params.avatarUrl,
        githubUserId: BigInt(params.githubUserId),
        updatedAt: new Date(),
      },
      create: {
        githubLogin: params.githubLogin,
        githubUserId: BigInt(params.githubUserId),
        avatarUrl: params.avatarUrl,
        organizationId: params.organizationId,
      },
    });

    logger.info('Developer upserted', { githubLogin: params.githubLogin, developerId: developer.id });
    return developer;
  }

  async upsertPullRequest(params: UpsertPullRequestParams): Promise<PullRequest> {
    const pullRequest = await prisma.pullRequest.upsert({
      where: {
        githubPrId_repositoryId: {
          githubPrId: BigInt(params.githubPrId),
          repositoryId: params.repositoryId,
        },
      },
      update: {
        title: params.title,
        headSha: params.headSha,
        baseBranch: params.baseBranch,
        headBranch: params.headBranch,
        prNumber: params.prNumber,
        state: 'open',
        updatedAt: new Date(),
      },
      create: {
        githubPrId: BigInt(params.githubPrId),
        prNumber: params.prNumber,
        title: params.title,
        headSha: params.headSha,
        baseBranch: params.baseBranch,
        headBranch: params.headBranch,
        organizationId: params.organizationId,
        repositoryId: params.repositoryId,
        developerId: params.developerId,
      },
    });

    logger.info('PullRequest upserted', {
      prNumber: params.prNumber,
      pullRequestId: pullRequest.id,
    });

    return pullRequest;
  }

  async createIssues(issues: CreateIssueInput[]): Promise<number> {
    if (issues.length === 0) {
      return 0;
    }

    const result = await prisma.issue.createMany({
      data: issues,
      skipDuplicates: true,
    });

    logger.info('Issues saved to database', { count: result.count });
    return result.count;
  }

  async getIssuesByDeveloper(params: {
    developerId: string;
    organizationId: string;
    since: Date;
  }): Promise<Issue[]> {
    return prisma.issue.findMany({
      where: {
        developerId: params.developerId,
        organizationId: params.organizationId,
        createdAt: { gte: params.since },
      },
      include: { pullRequest: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeveloperPatterns(params: {
    organizationId: string;
    since: Date;
  }): Promise<DeveloperPattern[]> {
    const groups = await prisma.issue.groupBy({
      by: ['developerId', 'category'],
      where: {
        organizationId: params.organizationId,
        createdAt: { gte: params.since },
      },
      _count: { category: true },
    });

    return groups.map((group) => ({
      developerId: group.developerId,
      category: group.category,
      count: group._count.category,
    }));
  }

  async createAgentTrace(pullRequestId: string): Promise<AgentTrace> {
    return prisma.agentTrace.create({
      data: {
        pullRequestId,
        logs: [],
      },
    });
  }

  async setAgentTraceLogs(traceId: string, logs: Prisma.InputJsonValue): Promise<void> {
    await prisma.agentTrace.update({
      where: { id: traceId },
      data: { logs },
    });
  }

  async findRecentIssuesForDeveloperHabitContext(params: {
    developerId: string;
    organizationId: string;
    excludePullRequestId: string;
    limit: number;
  }): Promise<
    Pick<Issue, 'file' | 'line' | 'category' | 'severity' | 'title' | 'createdAt'>[]
  > {
    return prisma.issue.findMany({
      where: {
        developerId: params.developerId,
        organizationId: params.organizationId,
        pullRequestId: { not: params.excludePullRequestId },
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      select: {
        file: true,
        line: true,
        category: true,
        severity: true,
        title: true,
        createdAt: true,
      },
    });
  }

  async getRepositorySettingsByRepositoryId(
    repositoryId: string,
  ): Promise<RepositorySettings | null> {
    return prisma.repositorySettings.findUnique({
      where: { repositoryId },
    });
  }

  async assertRepositoryInOrganization(
    repositoryId: string,
    organizationId: string,
  ): Promise<boolean> {
    const row = await prisma.repository.findFirst({
      where: { id: repositoryId, organizationId },
      select: { id: true },
    });
    return row !== null;
  }

  async upsertRepositorySettings(params: {
    repositoryId: string;
    organizationId: string;
    teamLeadEmail: string | null;
    escalationEnabled: boolean;
  }): Promise<RepositorySettings> {
    const ok = await this.assertRepositoryInOrganization(params.repositoryId, params.organizationId);
    if (!ok) {
      throw new Error('Repository not found for organization');
    }
    return prisma.repositorySettings.upsert({
      where: { repositoryId: params.repositoryId },
      update: {
        teamLeadEmail: params.teamLeadEmail,
        escalationEnabled: params.escalationEnabled,
      },
      create: {
        repositoryId: params.repositoryId,
        teamLeadEmail: params.teamLeadEmail,
        escalationEnabled: params.escalationEnabled,
      },
    });
  }

  async findRepositoryIdByGithubRepoId(
    githubRepoId: number,
  ): Promise<{ id: string } | null> {
    return prisma.repository.findUnique({
      where: { githubRepoId: BigInt(githubRepoId) },
      select: { id: true },
    });
  }

  async createProposedCodeFixes(
    rows: Array<{
      id: string;
      pullRequestId: string;
      fileName: string;
      beforeCode: string;
      afterCode: string;
      lineHunk: string;
    }>,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    await prisma.proposedCodeFix.createMany({ data: rows });
  }

  async createCustomIntervention(data: {
    developerId: string;
    targetPillar: string;
    lessonTitle: string;
    lessonMarkdown: string;
    status: string;
    targetSunday: Date;
  }): Promise<void> {
    await prisma.customIntervention.create({ data });
  }

  async getLatestAgentTraceByPullRequestId(
    pullRequestId: string,
  ): Promise<{ logs: unknown } | null> {
    return prisma.agentTrace.findFirst({
      where: { pullRequestId },
      orderBy: { createdAt: 'desc' },
      select: { logs: true },
    });
  }

  async getProposedCodeFixesForRepoFile(params: {
    organizationId: string;
    repoFullName: string;
    filePath: string;
  }): Promise<
    Array<{
      id: string;
      pullRequestId: string;
      fileName: string;
      beforeCode: string;
      afterCode: string;
      lineHunk: string;
    }>
  > {
    const repository = await prisma.repository.findFirst({
      where: { organizationId: params.organizationId, fullName: params.repoFullName },
      select: { id: true },
    });
    if (!repository) {
      return [];
    }
    return prisma.proposedCodeFix.findMany({
      where: {
        fileName: params.filePath,
        pullRequest: { repositoryId: repository.id },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        pullRequestId: true,
        fileName: true,
        beforeCode: true,
        afterCode: true,
        lineHunk: true,
      },
    });
  }

  async getAgentTraceLogsForOrganization(params: {
    organizationId: string;
    pullRequestId: string;
  }): Promise<{ logs: unknown[]; traceId: string | null; pullRequestExists: boolean }> {
    const owned = await prisma.pullRequest.findFirst({
      where: { id: params.pullRequestId, organizationId: params.organizationId },
      select: { id: true },
    });
    if (!owned) {
      return { logs: [], traceId: null, pullRequestExists: false };
    }
    const trace = await prisma.agentTrace.findFirst({
      where: { pullRequestId: params.pullRequestId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, logs: true },
    });
    if (!trace) {
      return { logs: [], traceId: null, pullRequestExists: true };
    }
    const raw = trace.logs;
    const logs = Array.isArray(raw) ? raw : [];
    return { logs, traceId: trace.id, pullRequestExists: true };
  }

  async listRecentAgentTracesForOrganization(
    organizationId: string,
    take: number,
  ): Promise<
    Array<{
      traceId: string;
      pullRequestId: string;
      prNumber: number;
      prTitle: string;
      repoFullName: string;
      logs: unknown;
      sessionStartedAt: Date;
    }>
  > {
    const rows = await prisma.agentTrace.findMany({
      where: { pullRequest: { organizationId } },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        pullRequestId: true,
        logs: true,
        createdAt: true,
        pullRequest: {
          select: {
            prNumber: true,
            title: true,
            repository: { select: { fullName: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      traceId: r.id,
      pullRequestId: r.pullRequestId,
      prNumber: r.pullRequest.prNumber,
      prTitle: r.pullRequest.title,
      repoFullName: r.pullRequest.repository.fullName,
      logs: r.logs,
      sessionStartedAt: r.createdAt,
    }));
  }

  async listQueuedCustomInterventionsForDeveloper(params: {
    organizationId: string;
    developerId: string;
  }): Promise<
    Array<{
      id: string;
      lessonTitle: string;
      lessonMarkdown: string;
      targetPillar: string;
      targetSunday: Date;
      status: string;
    }>
  > {
    const owned = await prisma.developer.findFirst({
      where: { id: params.developerId, organizationId: params.organizationId },
      select: { id: true },
    });
    if (!owned) {
      return [];
    }
    return prisma.customIntervention.findMany({
      where: { developerId: params.developerId, status: 'QUEUED' },
      orderBy: { targetSunday: 'asc' },
      take: 5,
      select: {
        id: true,
        lessonTitle: true,
        lessonMarkdown: true,
        targetPillar: true,
        targetSunday: true,
        status: true,
      },
    });
  }
}

export const databaseService = new DatabaseService();
