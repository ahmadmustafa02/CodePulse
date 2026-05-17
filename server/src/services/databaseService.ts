/** Database service layer: all Prisma operations for organizations, PRs, and issues. */

import type { Developer, Issue, Organization, PullRequest, Repository, User } from '@prisma/client';
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
    const user = await prisma.user.upsert({
      where: { githubUserId: params.githubUserId },
      update: {
        githubLogin: params.githubLogin,
        avatarUrl: params.avatarUrl ?? null,
        email: params.email ?? null,
        updatedAt: new Date(),
      },
      create: {
        githubLogin: params.githubLogin,
        githubUserId: params.githubUserId,
        avatarUrl: params.avatarUrl ?? null,
        email: params.email ?? null,
      },
    });

    logger.info('User upserted', { githubLogin: user.githubLogin, userId: user.id });
    return user;
  }

  async findUserByGithubUserId(githubUserId: bigint): Promise<User | null> {
    return prisma.user.findUnique({ where: { githubUserId } });
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
}

export const databaseService = new DatabaseService();
