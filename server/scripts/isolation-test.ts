/**
 * Multi-tenancy isolation suite.
 * Seeds two GitHub App installations and asserts tenant A never reads tenant B's rows
 * for every organization-scoped model, via tenantRepository().
 *
 * Usage (from server/): npm run test:isolation
 */

import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { tenantRepository, TenantScopeError } from '../src/services/tenantRepository';

loadEnv();

const prisma = new PrismaClient();

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`       ${detail}`);
}

async function seedTenant(label: 'A' | 'B', installationId: number, githubRepoId: number) {
  const org = await prisma.organization.upsert({
    where: { githubInstallationId: installationId },
    update: { name: `isolation-${label}` },
    create: { githubInstallationId: installationId, name: `isolation-${label}` },
  });

  const repo = await prisma.repository.upsert({
    where: { githubRepoId: BigInt(githubRepoId) },
    update: {
      name: `repo-${label.toLowerCase()}`,
      fullName: `isolation-${label.toLowerCase()}/repo-${label.toLowerCase()}`,
      organizationId: org.id,
    },
    create: {
      githubRepoId: BigInt(githubRepoId),
      name: `repo-${label.toLowerCase()}`,
      fullName: `isolation-${label.toLowerCase()}/repo-${label.toLowerCase()}`,
      private: false,
      organizationId: org.id,
    },
  });

  const developer = await prisma.developer.upsert({
    where: {
      githubLogin_organizationId: {
        githubLogin: `dev-${label.toLowerCase()}`,
        organizationId: org.id,
      },
    },
    update: { avatarUrl: null },
    create: {
      githubLogin: `dev-${label.toLowerCase()}`,
      githubUserId: BigInt(800000 + installationId),
      organizationId: org.id,
    },
  });

  const pr = await prisma.pullRequest.upsert({
    where: {
      githubPrId_repositoryId: {
        githubPrId: BigInt(700000 + installationId),
        repositoryId: repo.id,
      },
    },
    update: {
      title: `PR ${label}`,
      headSha: `isolation-head-${label}`,
      organizationId: org.id,
      developerId: developer.id,
    },
    create: {
      githubPrId: BigInt(700000 + installationId),
      prNumber: label === 'A' ? 1 : 2,
      title: `PR ${label}`,
      headSha: `isolation-head-${label}`,
      baseBranch: 'main',
      headBranch: `feature-${label}`,
      state: 'open',
      organizationId: org.id,
      repositoryId: repo.id,
      developerId: developer.id,
    },
  });

  // Clear prior issues/jobs/traces for this PR to keep the run deterministic
  await prisma.traceEvent.deleteMany({
    where: { organizationId: org.id },
  });
  await prisma.reviewJob.deleteMany({
    where: { organizationId: org.id },
  });
  await prisma.issue.deleteMany({
    where: { organizationId: org.id },
  });

  const issue = await prisma.issue.create({
    data: {
      file: `src/${label}.ts`,
      line: 10,
      category: 'security',
      severity: 'high',
      title: `Issue ${label}`,
      explanation: `secret for ${label}`,
      suggestion: 'fix it',
      codeSnippet: `const x${label} = 1`,
      organizationId: org.id,
      pullRequestId: pr.id,
      developerId: developer.id,
    },
  });

  const job = await prisma.reviewJob.create({
    data: {
      organizationId: org.id,
      repoId: repo.id,
      prNumber: pr.prNumber,
      headSha: `isolation-job-${label}-${Date.now()}`,
      status: 'completed',
      payload: { label },
    },
  });

  const trace = await prisma.traceEvent.create({
    data: {
      jobId: job.id,
      organizationId: org.id,
      step: 'analyze_diff',
      status: 'completed',
      completedAt: new Date(),
      metadata: { label },
    },
  });

  return { org, repo, developer, pr, issue, job, trace };
}

async function cleanup(installationIds: number[]): Promise<void> {
  for (const installationId of installationIds) {
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
  }
}

async function main(): Promise<void> {
  const installA = 910001;
  const installB = 910002;
  const repoA = 910101;
  const repoB = 910102;

  console.log('Isolation suite — seeding tenants A and B…\n');

  // Fresh seed
  await cleanup([installA, installB]);
  const a = await seedTenant('A', installA, repoA);
  const b = await seedTenant('B', installB, repoB);

  const tenantA = tenantRepository(a.org.id);
  const tenantB = tenantRepository(b.org.id);

  // --- Repositories ---
  const reposA = await tenantA.repositories.findMany();
  const reposB = await tenantB.repositories.findMany();
  record(
    'Repository: A only sees A',
    reposA.length === 1 && reposA[0].id === a.repo.id && !reposA.some((r) => r.id === b.repo.id),
    `A.count=${reposA.length} ids=[${reposA.map((r) => r.id).join(',')}] B.repo=${b.repo.id}`,
  );
  record(
    'Repository: B only sees B',
    reposB.length === 1 && reposB[0].id === b.repo.id && !reposB.some((r) => r.id === a.repo.id),
    `B.count=${reposB.length} ids=[${reposB.map((r) => r.id).join(',')}]`,
  );
  const crossRepo = await tenantA.repositories.findFirst({ where: { id: b.repo.id } });
  record(
    'Repository: A findFirst(B.id) → null',
    crossRepo === null,
    `result=${crossRepo?.id ?? 'null'}`,
  );

  // --- PullRequests ---
  const prsA = await tenantA.pullRequests.findMany();
  record(
    'PullRequest: A only sees A',
    prsA.length === 1 && prsA[0].id === a.pr.id && !prsA.some((p) => p.id === b.pr.id),
    `A.count=${prsA.length} ids=[${prsA.map((p) => p.id).join(',')}]`,
  );
  const crossPr = await tenantA.pullRequests.findFirst({ where: { id: b.pr.id } });
  record('PullRequest: A findFirst(B.id) → null', crossPr === null, `result=${crossPr?.id ?? 'null'}`);

  // --- Issues ---
  const issuesA = await tenantA.issues.findMany();
  const issuesB = await tenantB.issues.findMany();
  record(
    'Issue: A only sees A',
    issuesA.length === 1 && issuesA[0].id === a.issue.id && !issuesA.some((i) => i.id === b.issue.id),
    `A.count=${issuesA.length} title=${issuesA[0]?.title} B.title=${b.issue.title}`,
  );
  record(
    'Issue: B only sees B',
    issuesB.length === 1 && issuesB[0].id === b.issue.id,
    `B.count=${issuesB.length} title=${issuesB[0]?.title}`,
  );
  const crossIssue = await tenantA.issues.findFirst({ where: { id: b.issue.id } });
  record(
    'Issue: A findFirst(B.id) → null',
    crossIssue === null,
    `result=${crossIssue?.id ?? 'null'}`,
  );

  // --- Developers ---
  const devsA = await tenantA.developers.findMany();
  record(
    'Developer: A only sees A',
    devsA.length === 1 && devsA[0].id === a.developer.id && !devsA.some((d) => d.id === b.developer.id),
    `A.count=${devsA.length} login=${devsA[0]?.githubLogin}`,
  );
  const crossDev = await tenantA.developers.findFirst({ where: { id: b.developer.id } });
  record(
    'Developer: A findFirst(B.id) → null',
    crossDev === null,
    `result=${crossDev?.id ?? 'null'}`,
  );

  // --- ReviewJobs ---
  const jobsA = await tenantA.reviewJobs.findMany();
  record(
    'ReviewJob: A only sees A',
    jobsA.length === 1 && jobsA[0].id === a.job.id && !jobsA.some((j) => j.id === b.job.id),
    `A.count=${jobsA.length} ids=[${jobsA.map((j) => j.id).join(',')}]`,
  );
  const crossJob = await tenantA.reviewJobs.findById(b.job.id);
  record(
    'ReviewJob: A findById(B.id) → null',
    crossJob === null,
    `result=${crossJob?.id ?? 'null'}`,
  );

  // --- TraceEvents ---
  const tracesA = await tenantA.traces.findMany();
  const tracesB = await tenantB.traces.findMany();
  record(
    'TraceEvent: A only sees A',
    tracesA.length === 1 &&
      tracesA[0].id === a.trace.id &&
      !tracesA.some((t) => t.id === b.trace.id),
    `A.count=${tracesA.length} B.count=${tracesB.length}`,
  );
  const tracesForBJobViaA = await tenantA.traces.findForJob(b.job.id);
  record(
    'TraceEvent: A findForJob(B.jobId) → []',
    tracesForBJobViaA.length === 0,
    `count=${tracesForBJobViaA.length}`,
  );

  // --- Empty scope throws ---
  let threw = false;
  try {
    tenantRepository('');
  } catch (error) {
    threw = error instanceof TenantScopeError;
  }
  record('tenantRepository("") throws TenantScopeError', threw, `threw=${threw}`);

  // --- Counts ---
  record(
    'Counts: A.issues=1 B.issues=1 (no bleed)',
    (await tenantA.issues.count()) === 1 && (await tenantB.issues.count()) === 1,
    `A=${await tenantA.issues.count()} B=${await tenantB.issues.count()}`,
  );

  console.log('\n=== Isolation summary ===');
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} passed`);

  // Leave seed data for inspection, or clean — clean to avoid phantom dashboard rows
  await cleanup([installA, installB]);
  console.log('Cleaned isolation seed rows.');

  await prisma.$disconnect();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
