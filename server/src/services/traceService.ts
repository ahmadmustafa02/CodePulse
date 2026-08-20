/** Generic TraceEvent helpers for pipeline observability. */

import { Prisma } from '@prisma/client';
import { prisma } from './prismaService';
import { tenantRepository } from './tenantRepository';
import logger from '../utils/logger';

export type PipelineTracer = {
  run<T>(
    step: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<T>;
};

export function createJobTracer(jobId: string, organizationId: string): PipelineTracer {
  return {
    async run<T>(
      step: string,
      fn: () => Promise<T>,
      metadata?: Record<string, unknown>,
    ): Promise<T> {
      const event = await prisma.traceEvent.create({
        data: {
          jobId,
          organizationId,
          step,
          status: 'started',
          metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      try {
        const result = await fn();
        await prisma.traceEvent.update({
          where: { id: event.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
          },
        });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await prisma.traceEvent.update({
          where: { id: event.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            metadata: {
              ...(metadata ?? {}),
              error: message,
            } as Prisma.InputJsonValue,
          },
        });
        logger.warn('Trace step failed', { jobId, step, error: message });
        throw error;
      }
    },
  };
}

/** True when this job already completed `step` successfully (retry-safe skip). */
export async function hasCompletedStep(jobId: string, step: string): Promise<boolean> {
  const existing = await prisma.traceEvent.findFirst({
    where: { jobId, step, status: 'completed' },
    select: { id: true },
  });
  return existing !== null;
}

export async function listTracesForJob(jobId: string, organizationId?: string) {
  if (organizationId) {
    return tenantRepository(organizationId).traces.findForJob(jobId);
  }
  return prisma.traceEvent.findMany({
    where: { jobId },
    orderBy: { startedAt: 'asc' },
  });
}
