/**
 * Phase 1 live acceptance checks against real Postgres + Redis + local API.
 *
 * Prerequisites:
 * - docker compose up -d (Redis :6380)
 * - API running on :3001 (`npm run dev`)
 * - Worker stopped for check A; running for checks B/C
 *
 * Usage (from server/):
 *   npx ts-node scripts/acceptance-phase1.ts
 */

import crypto from 'crypto';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

loadEnv();

const prisma = new PrismaClient();
const API = process.env.ACCEPTANCE_API_URL ?? 'http://127.0.0.1:3001';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6380';
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET || WEBHOOK_SECRET.length < 20) {
  console.error('GITHUB_WEBHOOK_SECRET missing/too short in .env');
  process.exit(1);
}

type CheckResult = { name: string; ok: boolean; detail: string };

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`       ${detail}`);
}

function signBody(raw: Buffer): string {
  const digest = crypto.createHmac('sha256', WEBHOOK_SECRET!).update(raw).digest('hex');
  return `sha256=${digest}`;
}

function buildPayload(params: {
  deliverySuffix: string;
  installationId: number;
  githubRepoId: number;
  owner: string;
  repo: string;
  prNumber: number;
  githubPrId: number;
  headSha: string;
  action?: string;
}) {
  const fullName = `${params.owner}/${params.repo}`;
  return {
    action: params.action ?? 'opened',
    number: params.prNumber,
    pull_request: {
      id: params.githubPrId,
      number: params.prNumber,
      title: `Acceptance ${params.deliverySuffix}`,
      body: 'acceptance test',
      state: 'open' as const,
      merged: false,
      html_url: `https://github.com/${fullName}/pull/${params.prNumber}`,
      diff_url: `https://github.com/${fullName}/pull/${params.prNumber}.diff`,
      head: {
        sha: params.headSha,
        ref: 'feature/accept',
        repo: {
          id: params.githubRepoId,
          name: params.repo,
          full_name: fullName,
          private: false,
          owner: {
            id: 1,
            login: params.owner,
            avatar_url: '',
            html_url: `https://github.com/${params.owner}`,
          },
          html_url: `https://github.com/${fullName}`,
          default_branch: 'main',
        },
      },
      base: {
        sha: 'base',
        ref: 'main',
        repo: {
          id: params.githubRepoId,
          name: params.repo,
          full_name: fullName,
          private: false,
          owner: {
            id: 1,
            login: params.owner,
            avatar_url: '',
            html_url: `https://github.com/${params.owner}`,
          },
          html_url: `https://github.com/${fullName}`,
          default_branch: 'main',
        },
      },
      user: {
        id: 42,
        login: 'accept-bot',
        avatar_url: '',
        html_url: 'https://github.com/accept-bot',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      merged_at: null,
      additions: 1,
      deletions: 0,
      changed_files: 1,
    },
    repository: {
      id: params.githubRepoId,
      name: params.repo,
      full_name: fullName,
      private: false,
      owner: {
        id: 1,
        login: params.owner,
        avatar_url: '',
        html_url: `https://github.com/${params.owner}`,
      },
      html_url: `https://github.com/${fullName}`,
      default_branch: 'main',
    },
    sender: {
      id: 42,
      login: 'accept-bot',
      avatar_url: '',
      html_url: 'https://github.com/accept-bot',
    },
    installation: { id: params.installationId, node_id: 'MDInstAccept' },
  };
}

async function postWebhook(payload: unknown, deliveryId: string): Promise<{ status: number; body: string }> {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8');
  const response = await fetch(`${API}/api/v1/webhooks/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GitHub-Event': 'pull_request',
      'X-GitHub-Delivery': deliveryId,
      'X-Hub-Signature-256': signBody(raw),
    },
    body: raw,
  });
  const body = await response.text();
  return { status: response.status, body };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function checkDuplicateReturns202(): Promise<void> {
  const stamp = Date.now();
  const headSha = `cp-accept-dup-${stamp}`;
  const base = {
    installationId: 900001,
    githubRepoId: 900001,
    owner: 'accept-org',
    repo: 'accept-dup',
    prNumber: 91001,
    githubPrId: 91001001,
    headSha,
  };

  const first = await postWebhook(
    buildPayload({ ...base, deliverySuffix: `dup-a-${stamp}` }),
    `dup-a-${stamp}`,
  );
  const second = await postWebhook(
    buildPayload({ ...base, deliverySuffix: `dup-b-${stamp}` }),
    `dup-b-${stamp}`,
  );

  const jobs = await prisma.reviewJob.findMany({
    where: { headSha },
  });

  const ok =
    first.status === 202 &&
    second.status === 202 &&
    jobs.length === 1;

  record(
    'Duplicate headSha → both 202, exactly one ReviewJob',
    ok,
    `status1=${first.status} status2=${second.status} jobs=${jobs.length} jobId=${jobs[0]?.id ?? 'none'}`,
  );
}

async function checkKillWorkerStaysQueued(): Promise<void> {
  // Caller must stop the worker before this check.
  const stamp = Date.now();
  const headSha = `cp-accept-queue-${stamp}`;
  const base = {
    installationId: 900002,
    githubRepoId: 900002,
    owner: 'accept-org',
    repo: 'accept-queue',
    prNumber: 91002,
    githubPrId: 91002002,
    headSha,
  };

  const res = await postWebhook(
    buildPayload({ ...base, deliverySuffix: `queue-${stamp}` }),
    `queue-${stamp}`,
  );

  await sleep(1500);

  const job = await prisma.reviewJob.findFirst({ where: { headSha } });
  const stillQueued = job?.status === 'queued';

  const queue = new Queue('codepulse-review', {
    connection: { url: REDIS_URL, maxRetriesPerRequest: null },
  });
  const waiting = await queue.getWaitingCount();
  const delayed = await queue.getDelayedCount();
  await queue.close();

  record(
    'Worker down → job stays queued (DB + Redis)',
    res.status === 202 && stillQueued === true,
    `http=${res.status} dbStatus=${job?.status ?? 'missing'} waiting=${waiting} delayed=${delayed} jobId=${job?.id ?? 'none'}`,
  );

  // Stash job id for the restart follow-up printed at the end
  if (job) {
    (globalThis as { __acceptQueuedJobId?: string }).__acceptQueuedJobId = job.id;
  }
}

async function checkForceFailRetriesToDead(): Promise<void> {
  const stamp = Date.now();
  const headSha = `cp-accept-fail-${stamp}`;
  const base = {
    installationId: 900003,
    githubRepoId: 900003,
    owner: 'accept-org',
    repo: 'accept-fail',
    prNumber: 91003,
    githubPrId: 91003003,
    headSha,
  };

  const res = await postWebhook(
    buildPayload({ ...base, deliverySuffix: `fail-${stamp}` }),
    `fail-${stamp}`,
  );

  if (res.status !== 202) {
    record('Forced failure → 3 retries → dead', false, `webhook status ${res.status}: ${res.body}`);
    return;
  }

  const deadline = Date.now() + 90_000;
  let job = await prisma.reviewJob.findFirst({ where: { headSha } });

  while (Date.now() < deadline) {
    job = await prisma.reviewJob.findFirst({ where: { headSha } });
    if (job && (job.status === 'dead' || job.attempts >= 3)) {
      break;
    }
    await sleep(2000);
  }

  const traces = job
    ? await prisma.traceEvent.findMany({ where: { jobId: job.id }, orderBy: { startedAt: 'asc' } })
    : [];

  const ok =
    job?.status === 'dead' &&
    (job?.attempts ?? 0) >= 3 &&
    traces.some((t) => t.step === 'retry');

  record(
    'Forced failure → 3 retries → dead (+ retry traces)',
    Boolean(ok),
    `status=${job?.status} attempts=${job?.attempts} traces=${traces.length} steps=[${traces.map((t) => t.step).join(',')}] lastError=${job?.lastError ?? ''}`,
  );
}

async function checkUniqueConstraintDirect(): Promise<void> {
  const stamp = Date.now();
  const org = await prisma.organization.upsert({
    where: { githubInstallationId: 900099 },
    update: { name: 'accept-direct' },
    create: { githubInstallationId: 900099, name: 'accept-direct' },
  });
  const repo = await prisma.repository.upsert({
    where: { githubRepoId: BigInt(900099) },
    update: { name: 'accept-direct', fullName: 'accept-org/accept-direct', organizationId: org.id },
    create: {
      githubRepoId: BigInt(900099),
      name: 'accept-direct',
      fullName: 'accept-org/accept-direct',
      private: false,
      organizationId: org.id,
    },
  });

  const headSha = `cp-accept-unique-${stamp}`;
  const payload = { installationId: 900099, note: 'direct' };

  await prisma.reviewJob.create({
    data: {
      organizationId: org.id,
      repoId: repo.id,
      prNumber: 99,
      headSha,
      status: 'queued',
      payload,
    },
  });

  let threwP2002 = false;
  try {
    await prisma.reviewJob.create({
      data: {
        organizationId: org.id,
        repoId: repo.id,
        prNumber: 99,
        headSha,
        status: 'queued',
        payload,
      },
    });
  } catch (error) {
    threwP2002 =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002';
  }

  const count = await prisma.reviewJob.count({ where: { repoId: repo.id, prNumber: 99, headSha } });
  record(
    'Postgres UNIQUE(repoId,prNumber,headSha) rejects second insert',
    threwP2002 && count === 1,
    `P2002=${threwP2002} count=${count}`,
  );
}

async function main(): Promise<void> {
  console.log('Phase 1 acceptance — API', API, 'Redis', REDIS_URL);
  console.log('IMPORTANT: For check "Worker down → queued", stop `npm run worker:dev` first.\n');

  const health = await fetch(`${API}/api/v1/health`).then((r) => r.status).catch(() => 0);
  if (health !== 200) {
    console.error(`API health failed (${health}). Start npm run dev first.`);
    process.exit(1);
  }

  await checkUniqueConstraintDirect();
  await checkDuplicateReturns202();

  const mode = process.argv[2] ?? 'all';
  if (mode === 'queued' || mode === 'all') {
    await checkKillWorkerStaysQueued();
  }
  if (mode === 'fail' || mode === 'all') {
    console.log('\n(Ensure worker is RUNNING for the fail→dead check)\n');
    await checkForceFailRetriesToDead();
  }

  console.log('\n=== Summary ===');
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
  }

  const queuedId = (globalThis as { __acceptQueuedJobId?: string }).__acceptQueuedJobId;
  if (queuedId) {
    console.log(
      `\nQueued job ${queuedId} is waiting. Restart worker, then verify it leaves queued → processing/completed/dead.`,
    );
  }

  await prisma.$disconnect();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
