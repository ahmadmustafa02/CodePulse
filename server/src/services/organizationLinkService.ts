/** Links GitHub App installations to Organization rows (handles reinstall / new installation IDs). */

import type { Organization } from '@prisma/client';
import { githubAuthService } from './githubAuthService';
import { prisma } from './prismaService';
import logger from '../utils/logger';

type OrgCandidate = {
  id: string;
  githubInstallationId: number;
  name: string;
  pullRequestCount: number;
  repositoryCount: number;
};

function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

function collectLogins(accountLogin: string, installerLogin: string): string[] {
  const set = new Set<string>();
  for (const login of [accountLogin, installerLogin]) {
    const n = normalizeLogin(login);
    if (n) set.add(n);
  }
  return [...set];
}

async function findCandidateOrganizations(
  installationId: number,
  logins: string[],
): Promise<OrgCandidate[]> {
  if (logins.length === 0) return [];

  const nameFilters = logins.map((login) => ({
    name: { equals: login, mode: 'insensitive' as const },
  }));

  const repoFilters = logins.map((login) => ({
    fullName: { startsWith: `${login}/`, mode: 'insensitive' as const },
  }));

  const organizations = await prisma.organization.findMany({
    where: {
      githubInstallationId: { not: installationId },
      OR: [
        ...nameFilters,
        {
          repositories: {
            some: { OR: repoFilters },
          },
        },
        {
          developers: {
            some: {
              OR: logins.map((login) => ({
                githubLogin: { equals: login, mode: 'insensitive' as const },
              })),
            },
          },
        },
      ],
    },
    include: {
      _count: { select: { pullRequests: true, repositories: true } },
    },
  });

  return organizations.map((org) => ({
    id: org.id,
    githubInstallationId: org.githubInstallationId,
    name: org.name,
    pullRequestCount: org._count.pullRequests,
    repositoryCount: org._count.repositories,
  }));
}

function pickBestCandidate(candidates: OrgCandidate[]): OrgCandidate | null {
  if (candidates.length === 0) return null;

  const withData = candidates.filter((c) => c.pullRequestCount > 0 || c.repositoryCount > 0);
  const pool = withData.length > 0 ? withData : candidates;

  return pool.sort((a, b) => {
    if (b.pullRequestCount !== a.pullRequestCount) {
      return b.pullRequestCount - a.pullRequestCount;
    }
    return b.repositoryCount - a.repositoryCount;
  })[0];
}

async function removeEmptyOrganization(organizationId: string): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      _count: { select: { pullRequests: true, repositories: true, developers: true, issues: true } },
    },
  });

  if (!org) return;

  const empty =
    org._count.pullRequests === 0 &&
    org._count.repositories === 0 &&
    org._count.developers === 0 &&
    org._count.issues === 0;

  if (empty) {
    await prisma.organization.delete({ where: { id: organizationId } });
    logger.info('Removed empty duplicate organization', { organizationId });
  }
}

export class OrganizationLinkService {
  /**
   * Ensures an Organization exists for this installation and reconnects historical data
   * when the app was reinstalled (GitHub issues a new installation_id).
   */
  async linkInstallationToOrganization(
    installationId: number,
    installerGithubLogin: string,
  ): Promise<Organization> {
    const existing = await prisma.organization.findUnique({
      where: { githubInstallationId: installationId },
    });

    if (existing) {
      const counts = await prisma.organization.findUnique({
        where: { id: existing.id },
        select: {
          _count: { select: { pullRequests: true, repositories: true } },
        },
      });
      if (
        counts &&
        (counts._count.pullRequests > 0 || counts._count.repositories > 0)
      ) {
        return existing;
      }
    }

    let accountLogin = installerGithubLogin;
    try {
      const details = await githubAuthService.getInstallationDetails(installationId);
      accountLogin = details.account.login;
    } catch (error) {
      logger.warn('Could not fetch installation from GitHub; using installer login for reconnect', {
        installationId,
        installerGithubLogin,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const logins = collectLogins(accountLogin, installerGithubLogin);
    const candidates = await findCandidateOrganizations(installationId, logins);
    const best = pickBestCandidate(candidates);

    if (best) {
      if (existing && existing.id !== best.id) {
        await removeEmptyOrganization(existing.id);
      }

      const reconnected = await prisma.organization.update({
        where: { id: best.id },
        data: {
          githubInstallationId: installationId,
          name: accountLogin,
          updatedAt: new Date(),
        },
      });

      logger.info('Reconnected organization to new GitHub installation', {
        organizationId: reconnected.id,
        previousInstallationId: best.githubInstallationId,
        installationId,
        accountLogin,
        installerGithubLogin,
        pullRequestCount: best.pullRequestCount,
      });

      return reconnected;
    }

    const organization = await prisma.organization.upsert({
      where: { githubInstallationId: installationId },
      update: { name: accountLogin, updatedAt: new Date() },
      create: {
        githubInstallationId: installationId,
        name: accountLogin,
      },
    });

    logger.info('Organization ready for installation', {
      organizationId: organization.id,
      installationId,
      accountLogin,
    });

    return organization;
  }

  /** Attempt reconnect when session has installationId but no matching org (e.g. after past reinstall). */
  async tryReconnectOrphanedData(
    installationId: number,
    installerGithubLogin: string,
  ): Promise<Organization | null> {
    const current = await prisma.organization.findUnique({
      where: { githubInstallationId: installationId },
      include: { _count: { select: { pullRequests: true, repositories: true } } },
    });

    if (
      current &&
      (current._count.pullRequests > 0 || current._count.repositories > 0)
    ) {
      return current;
    }

    return this.linkInstallationToOrganization(installationId, installerGithubLogin);
  }
}

export const organizationLinkService = new OrganizationLinkService();
