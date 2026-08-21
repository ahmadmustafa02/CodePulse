/** BullMQ worker entrypoint — separate process from the HTTP API. */

import { Worker, type Job } from 'bullmq';
import { env } from './config/env';
import { REVIEW_JOB_MAX_ATTEMPTS, REVIEW_QUEUE_NAME, type ReviewJobPayload } from './types/reviewJob';
import type { EnqueueReviewJobData } from './services/queue';
import { reviewJobService } from './services/reviewJobService';
import { reviewPipelineService } from './services/reviewPipelineService';
import { createJobTracer } from './services/traceService';
import logger from './utils/logger';

function redisConnection() {
  return {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null as null,
  };
}

async function processReviewJob(job: Job<EnqueueReviewJobData>): Promise<void> {
  const { reviewJobId } = job.data;
  const record = await reviewJobService.getById(reviewJobId);

  if (!record) {
    logger.error('ReviewJob row missing for queue job', { reviewJobId, bullJobId: job.id });
    return;
  }

  if (record.status === 'completed') {
    logger.info('Skipping already completed ReviewJob', { reviewJobId });
    return;
  }

  const attempts = job.attemptsMade + 1;
  await reviewJobService.markProcessing(reviewJobId, attempts);

  const baseTracer = createJobTracer(reviewJobId, record.organizationId);
  // Stamp attempt on every step so retries are distinguishable in the Trace Viewer
  // (not only the synthetic `retry` row).
  const tracer = {
    run<T>(
      step: string,
      fn: () => Promise<T>,
      metadata?: Record<string, unknown>,
    ): Promise<T> {
      return baseTracer.run(step, fn, {
        ...metadata,
        attempt: attempts,
        maxAttempts: REVIEW_JOB_MAX_ATTEMPTS,
      });
    },
  };

  if (attempts > 1) {
    await tracer.run('retry', async () => undefined, {
      attempt: attempts,
      maxAttempts: REVIEW_JOB_MAX_ATTEMPTS,
    });
  }

  const payload = record.payload as unknown as ReviewJobPayload;

  try {
    await reviewPipelineService.run({
      jobId: reviewJobId,
      payload,
      tracer,
    });
    await reviewJobService.markCompleted(reviewJobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const terminal = attempts >= REVIEW_JOB_MAX_ATTEMPTS;
    await reviewJobService.markFailed(reviewJobId, message, terminal);
    logger.error('Review job failed', {
      reviewJobId,
      attempts,
      terminal,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

const worker = new Worker<EnqueueReviewJobData>(REVIEW_QUEUE_NAME, processReviewJob, {
  connection: redisConnection(),
  concurrency: 2,
});

worker.on('ready', () => {
  logger.info('Review worker ready', {
    queue: REVIEW_QUEUE_NAME,
    redis: env.REDIS_URL.replace(/\/\/.*@/, '//***@'),
  });
});

worker.on('failed', (job, error) => {
  logger.error('BullMQ job failed', {
    reviewJobId: job?.data?.reviewJobId,
    bullJobId: job?.id,
    attemptsMade: job?.attemptsMade,
    error: error.message,
  });
});

worker.on('completed', (job) => {
  logger.info('BullMQ job completed', {
    reviewJobId: job.data.reviewJobId,
    bullJobId: job.id,
  });
});

async function shutdown(signal: string): Promise<void> {
  logger.info('Worker shutdown signal received', { signal });
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

logger.info('Worker process starting', { environment: env.NODE_ENV });

// Phase 4: confirm host-level IMDS DROP on the real Linux worker (not Docker Desktop).
void (async () => {
  try {
    const { ensureSandboxNetworkPolicy } = await import('./services/refactorSandboxService');
    const policy = await ensureSandboxNetworkPolicy();
    if (policy.metadataFirewall === 'enforced') {
      logger.info('Sandbox IMDS host DROP active (DOCKER-USER)', {
        network: policy.network,
        metadataFirewall: policy.metadataFirewall,
      });
    } else {
      logger.error(
        'Sandbox IMDS host DROP NOT enforced — iptables unavailable. Probe/blackhole only. Do not treat Phase 4 as production-verified on this host.',
        { network: policy.network, metadataFirewall: policy.metadataFirewall },
      );
    }
  } catch (error) {
    logger.error('Sandbox network policy check failed at worker boot', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
})();
