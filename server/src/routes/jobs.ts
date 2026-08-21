/** Installation-scoped review job queue visibility for the dashboard. */

import { Router, type NextFunction, type Request, type Response } from 'express';
import {
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_OK,
  HTTP_STATUS_UNAUTHORIZED,
} from '../config/constants';
import { getOrganizationIdByInstallationId } from '../services/statsService';
import { getReviewQueueCounts } from '../services/queue';
import { reviewJobService } from '../services/reviewJobService';
import { listTracesForJob } from '../services/traceService';
import { getUserFromRequest } from '../services/sessionService';
import logger from '../utils/logger';

export const jobsRouter = Router();

const EMPTY_JOBS = {
  counts: {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    dead: 0,
  },
  queue: {
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
  },
  jobs: [] as unknown[],
};

type TraceMetadata = Record<string, unknown> | null;

function asMetadata(value: unknown): TraceMetadata {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function mapTraceTimeline(
  traces: Array<{
    id: string;
    step: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    metadata: unknown;
  }>,
) {
  const firstFailedIndex = traces.findIndex((t) => t.status === 'failed');

  return traces.map((t, index) => {
    const metadata = asMetadata(t.metadata);
    const attemptRaw = metadata?.attempt;
    const attempt = typeof attemptRaw === 'number' ? attemptRaw : null;
    const durationMs =
      t.completedAt !== null ? Math.max(0, t.completedAt.getTime() - t.startedAt.getTime()) : null;

    return {
      id: t.id,
      step: t.step,
      status: t.status,
      startedAt: t.startedAt.toISOString(),
      completedAt: t.completedAt?.toISOString() ?? null,
      durationMs,
      attempt,
      likelyRootCause: firstFailedIndex === index,
      metadata,
    };
  });
}

async function handleJobTraceRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = getUserFromRequest(req);
    if (!session) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({
        success: false,
        message: 'Sign in required',
      });
      return;
    }

    if (session.installationId === null) {
      res.status(HTTP_STATUS_NOT_FOUND).json({
        success: false,
        message: 'Job not found',
      });
      return;
    }

    const organizationId = await getOrganizationIdByInstallationId(session.installationId);
    if (!organizationId) {
      res.status(HTTP_STATUS_NOT_FOUND).json({
        success: false,
        message: 'Job not found',
      });
      return;
    }

    const job = await reviewJobService.getByIdForOrganization(organizationId, req.params.id);
    if (!job) {
      // Cross-tenant or unknown id — do not leak existence beyond 404.
      res.status(HTTP_STATUS_NOT_FOUND).json({
        success: false,
        message: 'Job not found',
      });
      return;
    }

    const traces = await listTracesForJob(job.id, organizationId);
    res.status(HTTP_STATUS_OK).json({
      success: true,
      data: {
        job: {
          id: job.id,
          repo: job.repository.fullName,
          prNumber: job.prNumber,
          headSha: job.headSha,
          status: job.status,
          attempts: job.attempts,
          lastError: job.lastError,
          createdAt: job.createdAt.toISOString(),
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
        },
        events: mapTraceTimeline(traces),
      },
    });
  } catch (error) {
    next(error);
  }
}

jobsRouter.get('/jobs', (req, res, next) => {
  void (async () => {
    try {
      const session = getUserFromRequest(req);
      if (!session) {
        res.status(HTTP_STATUS_UNAUTHORIZED).json({
          success: false,
          message: 'Sign in required',
        });
        return;
      }

      if (session.installationId === null) {
        res.status(HTTP_STATUS_OK).json({ success: true, data: EMPTY_JOBS });
        return;
      }

      const organizationId = await getOrganizationIdByInstallationId(session.installationId);
      if (!organizationId) {
        res.status(HTTP_STATUS_OK).json({ success: true, data: EMPTY_JOBS });
        return;
      }

      const [counts, jobs, queue] = await Promise.all([
        reviewJobService.countsByStatus(organizationId),
        reviewJobService.listForOrganization(organizationId, 50),
        getReviewQueueCounts().catch((error: unknown) => {
          logger.warn('Could not read BullMQ queue depths', {
            error: error instanceof Error ? error.message : String(error),
          });
          return EMPTY_JOBS.queue;
        }),
      ]);

      res.status(HTTP_STATUS_OK).json({
        success: true,
        data: {
          counts,
          queue,
          jobs: jobs.map((job) => ({
            id: job.id,
            repo: job.repository.fullName,
            prNumber: job.prNumber,
            headSha: job.headSha,
            status: job.status,
            attempts: job.attempts,
            lastError: job.lastError,
            deliveryId: job.deliveryId,
            createdAt: job.createdAt.toISOString(),
            startedAt: job.startedAt?.toISOString() ?? null,
            completedAt: job.completedAt?.toISOString() ?? null,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  })();
});

/** Spec path: GET /jobs/:id/trace */
jobsRouter.get('/jobs/:id/trace', (req, res, next) => {
  void handleJobTraceRequest(req, res, next);
});

/** Alias kept for earlier Phase 1 wiring */
jobsRouter.get('/jobs/:id/traces', (req, res, next) => {
  void handleJobTraceRequest(req, res, next);
});
