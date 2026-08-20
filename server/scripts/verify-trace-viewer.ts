/**
 * Trace Viewer acceptance: completed timeline, fail+retry root-cause, cross-tenant 404 on /trace and /traces.
 *
 * Prerequisites: API on :3001 (`npm run dev`)
 * Usage: npx ts-node scripts/verify-trace-viewer.ts
 */

import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { signUserSession } from '../src/services/sessionService';

loadEnv();

const prisma = new PrismaClient();
const API = process.env.ACCEPTANCE_API_URL ?? 'http://127.0.0.1:3001/api/v1';

const INST_A = 910001;
const INST_B = 910002;
const REPO_A = 920001;
const REPO_B = 920002;

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(detail);
}

function cookieFor(installationId: number): string {
  const token = signUserSession({
    githubLogin: `trace-viewer-${installationId}`,
    avatarUrl: null,
    githubUserId: String(800000 + installationId),
    installationId,
  });
  return `codepulse_session=${encodeURIComponent(token)}`;
}

async function apiGet(path: string, installationId: number): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch(`${API}${path}`, {
    headers: { Cookie: cookieFor(installationId) },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body, headers: res.headers };
}

async function seedTenant(label: 'A' | 'B', installationId: number, githubRepoId: number) {
  const org = await prisma.organization.upsert({
    where: { githubInstallationId: installationId },
    update: { name: `trace-verify-${label}` },
    create: { githubInstallationId: installationId, name: `trace-verify-${label}` },
  });

  const repo = await prisma.repository.upsert({
    where: { githubRepoId: BigInt(githubRepoId) },
    update: {
      name: `tv-repo-${label.toLowerCase()}`,
      fullName: `trace-verify-${label.toLowerCase()}/tv-repo-${label.toLowerCase()}`,
      organizationId: org.id,
    },
    create: {
      githubRepoId: BigInt(githubRepoId),
      name: `tv-repo-${label.toLowerCase()}`,
      fullName: `trace-verify-${label.toLowerCase()}/tv-repo-${label.toLowerCase()}`,
      private: false,
      organizationId: org.id,
    },
  });

  await prisma.traceEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.reviewJob.deleteMany({ where: { organizationId: org.id } });

  return { org, repo };
}

async function main(): Promise<void> {
  const a = await seedTenant('A', INST_A, REPO_A);
  const b = await seedTenant('B', INST_B, REPO_B);

  // --- Completed job with a full happy-path timeline ---
  const completedJob = await prisma.reviewJob.create({
    data: {
      organizationId: a.org.id,
      repoId: a.repo.id,
      prNumber: 101,
      headSha: `tv-complete-${Date.now()}`,
      status: 'completed',
      attempts: 1,
      payload: { acceptance: true },
      startedAt: new Date(Date.now() - 30_000),
      completedAt: new Date(),
    },
  });

  const t0 = Date.now() - 25_000;
  const completedSteps = [
    { step: 'fetch_diff', status: 'completed', startedAt: new Date(t0), completedAt: new Date(t0 + 1200), metadata: { filesChanged: 3 } },
    { step: 'triage', status: 'completed', startedAt: new Date(t0 + 1300), completedAt: new Date(t0 + 2100), metadata: { selectedFiles: 2 } },
    { step: 'chunk_0_analysis', status: 'completed', startedAt: new Date(t0 + 2200), completedAt: new Date(t0 + 9800), metadata: { chunkIndex: 0 } },
    { step: 'comment_post', status: 'completed', startedAt: new Date(t0 + 9900), completedAt: new Date(t0 + 11200), metadata: {} },
    { step: 'persist', status: 'completed', startedAt: new Date(t0 + 11300), completedAt: new Date(t0 + 12100), metadata: {} },
  ];
  for (const s of completedSteps) {
    await prisma.traceEvent.create({
      data: {
        jobId: completedJob.id,
        organizationId: a.org.id,
        ...s,
      },
    });
  }

  // --- Forced-fail + retries: fail on fetch_diff attempt 1, succeed later ---
  const failJob = await prisma.reviewJob.create({
    data: {
      organizationId: a.org.id,
      repoId: a.repo.id,
      prNumber: 102,
      headSha: `tv-fail-${Date.now()}`,
      status: 'completed',
      attempts: 2,
      lastError: null,
      payload: { acceptance: true, forced: true },
      startedAt: new Date(Date.now() - 60_000),
      completedAt: new Date(),
    },
  });

  const f0 = Date.now() - 55_000;
  const failSteps = [
    // Attempt 1 — fails (matches worker stamping attempt on every step)
    {
      step: 'fetch_diff',
      status: 'failed',
      startedAt: new Date(f0),
      completedAt: new Date(f0 + 400),
      metadata: { attempt: 1, maxAttempts: 3, error: 'Forced acceptance failure' },
    },
    {
      step: 'retry',
      status: 'completed',
      startedAt: new Date(f0 + 5000),
      completedAt: new Date(f0 + 5100),
      metadata: { attempt: 2, maxAttempts: 3 },
    },
    // Attempt 2 — succeeds
    {
      step: 'fetch_diff',
      status: 'completed',
      startedAt: new Date(f0 + 5200),
      completedAt: new Date(f0 + 6400),
      metadata: { attempt: 2, maxAttempts: 3, filesChanged: 1 },
    },
    {
      step: 'analyze_diff',
      status: 'completed',
      startedAt: new Date(f0 + 6500),
      completedAt: new Date(f0 + 15000),
      metadata: { attempt: 2, maxAttempts: 3 },
    },
    {
      step: 'comment_post',
      status: 'completed',
      startedAt: new Date(f0 + 15100),
      completedAt: new Date(f0 + 16000),
      metadata: { attempt: 2, maxAttempts: 3 },
    },
    {
      step: 'persist',
      status: 'completed',
      startedAt: new Date(f0 + 16100),
      completedAt: new Date(f0 + 16800),
      metadata: { attempt: 2, maxAttempts: 3 },
    },
  ];
  for (const s of failSteps) {
    await prisma.traceEvent.create({
      data: {
        jobId: failJob.id,
        organizationId: a.org.id,
        ...s,
      },
    });
  }

  // Tenant B job (should 404 for A)
  const bJob = await prisma.reviewJob.create({
    data: {
      organizationId: b.org.id,
      repoId: b.repo.id,
      prNumber: 201,
      headSha: `tv-b-${Date.now()}`,
      status: 'completed',
      attempts: 1,
      payload: {},
    },
  });
  await prisma.traceEvent.create({
    data: {
      jobId: bJob.id,
      organizationId: b.org.id,
      step: 'fetch_diff',
      status: 'completed',
      startedAt: new Date(),
      completedAt: new Date(),
      metadata: { secret: 'should-not-leak' },
    },
  });

  // Health check API
  try {
    const health = await fetch(`${API.replace(/\/api\/v1$/, '')}/api/v1/health`);
    if (!health.ok) throw new Error(`health ${health.status}`);
  } catch (error) {
    console.error('API not reachable at', API, error);
    process.exit(1);
  }

  // 1) Completed job trace
  const completed = await apiGet(`/jobs/${completedJob.id}/trace`, INST_A);
  const completedBody = completed.body as {
    success?: boolean;
    data?: { events?: Array<Record<string, unknown>> };
  };
  const events = completedBody.data?.events ?? [];
  const ordered = events.map((e) => `${e.step}:${e.status}:${e.durationMs}ms`);
  const allHaveDuration = events.every(
    (e) => e.status === 'started' || (typeof e.durationMs === 'number' && (e.durationMs as number) >= 0),
  );
  record(
    'Completed job ordered timeline with real durations',
    completed.status === 200 && completedBody.success === true && events.length === 5 && allHaveDuration,
    JSON.stringify(
      {
        httpStatus: completed.status,
        eventCount: events.length,
        timeline: events.map((e) => ({
          step: e.step,
          status: e.status,
          durationMs: e.durationMs,
          likelyRootCause: e.likelyRootCause,
        })),
        ordered,
      },
      null,
      2,
    ),
  );

  // 2) Forced fail + retry root cause
  const failed = await apiGet(`/jobs/${failJob.id}/trace`, INST_A);
  const failedBody = failed.body as {
    success?: boolean;
    data?: { events?: Array<Record<string, unknown>> };
  };
  const fevents = failedBody.data?.events ?? [];
  const rootCauses = fevents.filter((e) => e.likelyRootCause === true);
  const firstFailed = fevents.find((e) => e.status === 'failed');
  const retryStep = fevents.find((e) => e.step === 'retry');
  const laterFetch = fevents.filter((e) => e.step === 'fetch_diff');
  const rootIsFirstFailure =
    rootCauses.length === 1 &&
    firstFailed !== undefined &&
    rootCauses[0].id === firstFailed.id &&
    rootCauses[0].step === 'fetch_diff' &&
    rootCauses[0].status === 'failed';
  const attemptOnRetry =
    retryStep !== undefined &&
    typeof (retryStep.attempt as number | null) === 'number' &&
    retryStep.attempt === 2;
  const twoFetchRows =
    laterFetch.length === 2 &&
    laterFetch[0].status === 'failed' &&
    laterFetch[0].attempt === 1 &&
    laterFetch[1].status === 'completed' &&
    laterFetch[1].attempt === 2;
  const rootCauseNotOnSuccess =
    laterFetch[1] !== undefined && laterFetch[1].likelyRootCause !== true;

  record(
    'Forced-fail/retry: likelyRootCause = first failure; attempt distinguishes retries',
    failed.status === 200 &&
      rootIsFirstFailure &&
      attemptOnRetry &&
      twoFetchRows &&
      rootCauseNotOnSuccess,
    JSON.stringify(
      {
        httpStatus: failed.status,
        rootCauseCount: rootCauses.length,
        rootCause: rootCauses[0]
          ? {
              step: rootCauses[0].step,
              status: rootCauses[0].status,
              likelyRootCause: rootCauses[0].likelyRootCause,
              metadata: rootCauses[0].metadata,
            }
          : null,
        retryStep: retryStep
          ? {
              step: retryStep.step,
              status: retryStep.status,
              attempt: retryStep.attempt,
              likelyRootCause: retryStep.likelyRootCause,
              metadata: retryStep.metadata,
            }
          : null,
        fetchDiffRows: laterFetch.map((e) => ({
          step: e.step,
          status: e.status,
          attempt: e.attempt,
          likelyRootCause: e.likelyRootCause,
          durationMs: e.durationMs,
        })),
        fullTimeline: fevents.map((e) => ({
          step: e.step,
          status: e.status,
          attempt: e.attempt,
          likelyRootCause: e.likelyRootCause,
          durationMs: e.durationMs,
        })),
      },
      null,
      2,
    ),
  );

  // 3) Cross-tenant 404 on /trace and /traces
  const crossTrace = await apiGet(`/jobs/${bJob.id}/trace`, INST_A);
  const crossTraces = await apiGet(`/jobs/${bJob.id}/traces`, INST_A);
  const crossTraceBody = crossTrace.body as { success?: boolean; message?: string; data?: unknown };
  const crossTracesBody = crossTraces.body as { success?: boolean; message?: string; data?: unknown };
  const noLeak =
    JSON.stringify(crossTrace.body).includes('should-not-leak') === false &&
    JSON.stringify(crossTraces.body).includes('should-not-leak') === false;

  record(
    'Cross-tenant 404 on /trace AND /traces alias',
    crossTrace.status === 404 &&
      crossTraces.status === 404 &&
      crossTraceBody.success === false &&
      crossTracesBody.success === false &&
      noLeak,
    JSON.stringify(
      {
        primary: { path: `/jobs/${bJob.id}/trace`, status: crossTrace.status, body: crossTrace.body },
        alias: { path: `/jobs/${bJob.id}/traces`, status: crossTraces.status, body: crossTraces.body },
      },
      null,
      2,
    ),
  );

  // 4) Rate-limit headers present (global limiter)
  const rl = await apiGet(`/jobs/${completedJob.id}/trace`, INST_A);
  const rateLimitLimit = rl.headers.get('ratelimit-limit') ?? rl.headers.get('x-ratelimit-limit');
  const rateLimitRemaining =
    rl.headers.get('ratelimit-remaining') ?? rl.headers.get('x-ratelimit-remaining');
  record(
    'Trace route covered by global express-rate-limit (standardHeaders)',
    rateLimitLimit !== null && rateLimitRemaining !== null,
    JSON.stringify(
      {
        note: 'CodePulse mounts one app-level rateLimit on all routes including session-cookie APIs (unlike LabCrew bearer-only gap).',
        RateLimitLimit: rateLimitLimit,
        RateLimitRemaining: rateLimitRemaining,
        RateLimitPolicy: rl.headers.get('ratelimit-policy'),
      },
      null,
      2,
    ),
  );

  const failedCount = results.filter((r) => !r.ok).length;
  console.log(`\n=== ${results.length - failedCount}/${results.length} passed ===`);
  await prisma.$disconnect();
  process.exit(failedCount === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
