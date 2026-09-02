/** BullMQ queue producer for durable PR review jobs. */

import { Queue } from 'bullmq';
import { env } from '../config/env';
import {
  REVIEW_JOB_BACKOFF_MS,
  REVIEW_JOB_MAX_ATTEMPTS,
  REVIEW_QUEUE_NAME,
} from '../types/reviewJob';
import logger from '../utils/logger';

export type EnqueueReviewJobData = {
  reviewJobId: string;
};

let reviewQueue: Queue<EnqueueReviewJobData> | null = null;

function redisConnection() {
  return {
    url: env.REDIS_URL,
    maxRetriesPerRequest: null as null,
    // Fail fast on bad Upstash URLs instead of hanging until GitHub webhook timeout.
    connectTimeout: 10_000,
    enableOfflineQueue: false,
  };
}

export function getReviewQueue(): Queue<EnqueueReviewJobData> {
  if (!reviewQueue) {
    reviewQueue = new Queue<EnqueueReviewJobData>(REVIEW_QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: REVIEW_JOB_MAX_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: REVIEW_JOB_BACKOFF_MS,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    });
  }
  return reviewQueue;
}

export async function enqueueReviewJob(reviewJobId: string): Promise<void> {
  const queue = getReviewQueue();
  await queue.add(
    'review',
    { reviewJobId },
    {
      jobId: reviewJobId,
      attempts: REVIEW_JOB_MAX_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: REVIEW_JOB_BACKOFF_MS,
      },
    },
  );
  logger.info('Review job enqueued', { reviewJobId, queue: REVIEW_QUEUE_NAME });
}

export async function getReviewQueueCounts(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getReviewQueue();
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
  };
}

export async function closeReviewQueue(): Promise<void> {
  if (reviewQueue) {
    await reviewQueue.close();
    reviewQueue = null;
  }
}
