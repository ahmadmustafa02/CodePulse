/**
 * Tenant-scoped data access.
 *
 * Tenant = GitHub App installation → Organization (organizationId).
 * Every read/query touching Repository, PullRequest, Issue, Developer,
 * ReviewJob, or TraceEvent MUST go through `tenantRepository(organizationId)`.
 * Passing an empty/missing organizationId throws — forgetting the scope is a hard error.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from './prismaService';

export class TenantScopeError extends Error {
  constructor(message = 'organizationId is required for tenant-scoped queries') {
    super(message);
    this.name = 'TenantScopeError';
  }
}

function requireOrganizationId(organizationId: string): string {
  if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
    throw new TenantScopeError();
  }
  return organizationId;
}

export type TenantRepository = ReturnType<typeof tenantRepository>;

function withOrg<W>(orgId: string, where: W | undefined): W & { organizationId: string } {
  return { ...(where as object), organizationId: orgId } as W & { organizationId: string };
}

/**
 * Returns a repository bound to a single organization.
 * Callers resolve installationId → organizationId at the route/session boundary first.
 * Any `organizationId` in caller `where` is overwritten by the bound tenant id.
 */
export function tenantRepository(organizationId: string) {
  const orgId = requireOrganizationId(organizationId);

  return {
    organizationId: orgId,

    repositories: {
      findMany<T extends Prisma.RepositoryFindManyArgs>(
        args?: Prisma.SelectSubset<T, Prisma.RepositoryFindManyArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.RepositoryFindManyArgs;
        return prisma.repository.findMany({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.RepositoryFindManyArgs>);
      },
      findFirst<T extends Prisma.RepositoryFindFirstArgs>(
        args?: Prisma.SelectSubset<T, Prisma.RepositoryFindFirstArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.RepositoryFindFirstArgs;
        return prisma.repository.findFirst({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.RepositoryFindFirstArgs>);
      },
      count(where?: Prisma.RepositoryWhereInput) {
        return prisma.repository.count({ where: withOrg(orgId, where) });
      },
    },

    pullRequests: {
      findMany<T extends Prisma.PullRequestFindManyArgs>(
        args?: Prisma.SelectSubset<T, Prisma.PullRequestFindManyArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.PullRequestFindManyArgs;
        return prisma.pullRequest.findMany({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.PullRequestFindManyArgs>);
      },
      findFirst<T extends Prisma.PullRequestFindFirstArgs>(
        args?: Prisma.SelectSubset<T, Prisma.PullRequestFindFirstArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.PullRequestFindFirstArgs;
        return prisma.pullRequest.findFirst({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.PullRequestFindFirstArgs>);
      },
      count(where?: Prisma.PullRequestWhereInput) {
        return prisma.pullRequest.count({ where: withOrg(orgId, where) });
      },
    },

    issues: {
      findMany<T extends Prisma.IssueFindManyArgs>(
        args?: Prisma.SelectSubset<T, Prisma.IssueFindManyArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.IssueFindManyArgs;
        return prisma.issue.findMany({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.IssueFindManyArgs>);
      },
      findFirst<T extends Prisma.IssueFindFirstArgs>(
        args?: Prisma.SelectSubset<T, Prisma.IssueFindFirstArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.IssueFindFirstArgs;
        return prisma.issue.findFirst({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.IssueFindFirstArgs>);
      },
      count(where?: Prisma.IssueWhereInput) {
        return prisma.issue.count({ where: withOrg(orgId, where) });
      },
      groupByCategory() {
        return prisma.issue.groupBy({
          by: ['category'],
          where: { organizationId: orgId },
          _count: { category: true },
        });
      },
      groupBySeverity() {
        return prisma.issue.groupBy({
          by: ['severity'],
          where: { organizationId: orgId },
          _count: { severity: true },
        });
      },
    },

    developers: {
      findMany<T extends Prisma.DeveloperFindManyArgs>(
        args?: Prisma.SelectSubset<T, Prisma.DeveloperFindManyArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.DeveloperFindManyArgs;
        return prisma.developer.findMany({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.DeveloperFindManyArgs>);
      },
      findFirst<T extends Prisma.DeveloperFindFirstArgs>(
        args?: Prisma.SelectSubset<T, Prisma.DeveloperFindFirstArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.DeveloperFindFirstArgs;
        return prisma.developer.findFirst({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.DeveloperFindFirstArgs>);
      },
      count(where?: Prisma.DeveloperWhereInput) {
        return prisma.developer.count({ where: withOrg(orgId, where) });
      },
    },

    reviewJobs: {
      findMany<T extends Prisma.ReviewJobFindManyArgs>(
        args?: Prisma.SelectSubset<T, Prisma.ReviewJobFindManyArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.ReviewJobFindManyArgs;
        return prisma.reviewJob.findMany({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.ReviewJobFindManyArgs>);
      },
      findFirst<T extends Prisma.ReviewJobFindFirstArgs>(
        args?: Prisma.SelectSubset<T, Prisma.ReviewJobFindFirstArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.ReviewJobFindFirstArgs;
        return prisma.reviewJob.findFirst({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.ReviewJobFindFirstArgs>);
      },
      async findById(id: string) {
        return prisma.reviewJob.findFirst({
          where: { id, organizationId: orgId },
        });
      },
      count(where?: Prisma.ReviewJobWhereInput) {
        return prisma.reviewJob.count({ where: withOrg(orgId, where) });
      },
      groupByStatus() {
        return prisma.reviewJob.groupBy({
          by: ['status'],
          where: { organizationId: orgId },
          _count: { _all: true },
        });
      },
    },

    traces: {
      findMany<T extends Prisma.TraceEventFindManyArgs>(
        args?: Prisma.SelectSubset<T, Prisma.TraceEventFindManyArgs>,
      ) {
        const { where, ...rest } = (args ?? {}) as Prisma.TraceEventFindManyArgs;
        return prisma.traceEvent.findMany({
          ...rest,
          where: withOrg(orgId, where),
        } as Prisma.SelectSubset<T, Prisma.TraceEventFindManyArgs>);
      },
      findForJob(jobId: string) {
        return prisma.traceEvent.findMany({
          where: { jobId, organizationId: orgId },
          orderBy: { startedAt: 'asc' },
        });
      },
      count(where?: Prisma.TraceEventWhereInput) {
        return prisma.traceEvent.count({ where: withOrg(orgId, where) });
      },
    },
  };
}
