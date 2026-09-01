/**
 * Removes Phase 1 acceptance-test rows (accept-org / installation 9000xx).
 * Safe to run anytime — only deletes clearly synthetic acceptance fixtures.
 *
 * Usage: npm run cleanup:acceptance
 */

import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv();

const prisma = new PrismaClient();

const ACCEPT_INSTALLATION_IDS = [900001, 900002, 900003, 900099];

async function main(): Promise<void> {
  let deletedOrgs = 0;
  for (const installationId of ACCEPT_INSTALLATION_IDS) {
    const org = await prisma.organization.findUnique({
      where: { githubInstallationId: installationId },
    });
    if (!org) continue;

    await prisma.traceEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.reviewJob.deleteMany({ where: { organizationId: org.id } });
    await prisma.issue.deleteMany({ where: { organizationId: org.id } });
    await prisma.pullRequest.deleteMany({ where: { organizationId: org.id } });
    await prisma.developer.deleteMany({ where: { organizationId: org.id } });
    await prisma.repository.deleteMany({ where: { organizationId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    deletedOrgs += 1;
    console.log(`Removed acceptance org installationId=${installationId} id=${org.id}`);
  }

  // Also catch any leftover accept-org repos by name prefix
  const strayRepos = await prisma.repository.findMany({
    where: { fullName: { startsWith: 'accept-org/' } },
  });
  for (const repo of strayRepos) {
    await prisma.traceEvent.deleteMany({
      where: { job: { repoId: repo.id } },
    });
    await prisma.reviewJob.deleteMany({ where: { repoId: repo.id } });
    await prisma.issue.deleteMany({
      where: { pullRequest: { repositoryId: repo.id } },
    });
    await prisma.pullRequest.deleteMany({ where: { repositoryId: repo.id } });
    await prisma.repository.delete({ where: { id: repo.id } });
    console.log(`Removed stray repo ${repo.fullName}`);
  }

  console.log(`Done. Organizations removed: ${deletedOrgs}`);
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
