/** Persist and query ReviewJob + TraceEvent rows. */

import { Prisma } from '@prisma/client';
import type { ReviewJob } from '@prisma/client';
import { prisma } from './prismaService';
import { tenantRepository } from './tenantRepository';
import type { ReviewJobPayload, ReviewJobStatus } from '../types/reviewJob';
import logger from '../utils/logger';

export type CreateReviewJobParams = {
  organizationId: string;
  repoId: string;
  prNumber: number;
  headSha: string;
  deliveryId: string;
  payload: ReviewJobPayload;
};

export type CreateReviewJobResult =
  | { created: true; job: ReviewJob }
  | { created: false; reason: 'duplicate'; job: ReviewJob | null };

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export class ReviewJobService {
  /**
   * Inserts a ReviewJob. Concurrent duplicates are rejected by the Postgres
   * unique constraint on (repoId, prNumber, headSha) — not by check-then-insert.
   */
  async tryCreateJob(params: CreateReviewJobParams): Promise<CreateReviewJobResult> {
    try {
      const job = await prisma.reviewJob.create({
        data: {
          organizationId: params.organizationId,
          repoId: params.repoId,
          prNumber: params.prNumber,
          headSha: params.headSha,
          status: 'queued',
          deliveryId: params.deliveryId,
          payload: params.payload as unknown as Prisma.InputJsonValue,
        },
      });
      return { created: true, job };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await prisma.reviewJob.findUnique({
          where: {
            repoId_prNumber_headSha: {
              repoId: params.repoId,
              prNumber: params.prNumber,
              headSha: params.headSha,
            },
          },
        });
        logger.info('ReviewJob insert rejected by unique constraint', {
          repoId: params.repoId,
          prNumber: params.prNumber,
          headSha: params.headSha,
          existingJobId: existing?.id,
        });
        return { created: false, reason: 'duplicate', job: existing };
      }
      throw error;
    }
  }

  async getById(id: string): Promise<ReviewJob | null> {
    return prisma.reviewJob.findUnique({ where: { id } });
  }

  async markProcessing(id: string, attempts: number): Promise<void> {
    await prisma.reviewJob.update({
      where: { id },
      data: {
        status: 'processing',
        attempts,
        startedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markCompleted(id: string): Promise<void> {
    await prisma.reviewJob.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markFailed(id: string, lastError: string, terminal: boolean): Promise<void> {
    const status: ReviewJobStatus = terminal ? 'dead' : 'failed';
    await prisma.reviewJob.update({
      where: { id },
      data: {
        status,
        lastError: lastError.slice(0, 2000),
        completedAt: terminal ? new Date() : undefined,
      },
    });
  }

  /** Redis enqueue failed after insert — keep row queued for a later re-enqueue. */
  async markEnqueueError(id: string, lastError: string): Promise<void> {
    await prisma.reviewJob.update({
      where: { id },
      data: {
        status: 'queued',
        lastError: lastError.slice(0, 2000),
      },
    });
  }

  async resetToQueued(id: string): Promise<void> {
    await prisma.reviewJob.update({
      where: { id },
      data: {
        status: 'queued',
        completedAt: null,
        startedAt: null,
        lastError: null,
      },
    });
  }

  async listForOrganization(organizationId: string, limit = 50): Promise<
    Array<
      ReviewJob & {
        repository: { fullName: string };
      }
    >
  > {
    const tenant = tenantRepository(organizationId);
    return tenant.reviewJobs.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        repository: { select: { fullName: true } },
      },
    }) as Promise<
      Array<
        ReviewJob & {
          repository: { fullName: string };
        }
      >
    >;
  }

  async countsByStatus(organizationId: string): Promise<Record<string, number>> {
    const tenant = tenantRepository(organizationId);
    const rows = await tenant.reviewJobs.groupByStatus();
    const result: Record<string, number> = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    };
    for (const row of rows) {
      result[row.status] = row._count._all;
    }
    return result;
  }

  /** Tenant-safe lookup: returns null if the job is not in this organization. */
  async getByIdForOrganization(
    organizationId: string,
    id: string,
  ): Promise<(ReviewJob & { repository: { fullName: string } }) | null> {
    return tenantRepository(organizationId).reviewJobs.findFirst({
      where: { id },
      include: {
        repository: { select: { fullName: true } },
      },
    }) as Promise<(ReviewJob & { repository: { fullName: string } }) | null>;
  }
}

export const reviewJobService = new ReviewJobService();
