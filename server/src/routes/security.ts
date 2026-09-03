/** Security / injection-defense overview for the dashboard. */

import * as fs from 'fs';
import * as path from 'path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from '../config/constants';
import { prisma } from '../services/prismaService';
import { getOrganizationIdByInstallationId } from '../services/statsService';
import { getUserFromRequest } from '../services/sessionService';
import logger from '../utils/logger';

export const securityRouter = Router();

type EvalHarnessLatest = {
  version: number;
  ranAt: string;
  summary: {
    total: number;
    caught: number;
    missed: number;
    catchRate: number;
  };
  byCategory: Record<string, { total: number; caught: number; catchRate: number }>;
};

function loadEvalHarnessLatest(): EvalHarnessLatest | null {
  const candidates = [
    path.join(__dirname, '..', 'eval-harness', 'results', 'latest.json'),
    path.join(process.cwd(), 'src', 'eval-harness', 'results', 'latest.json'),
    path.join(process.cwd(), 'dist', 'eval-harness', 'results', 'latest.json'),
    path.join(process.cwd(), 'eval-harness', 'results', 'latest.json'),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as EvalHarnessLatest;
    } catch (error) {
      logger.warn('Failed to parse eval-harness results', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return null;
}

securityRouter.get('/security', (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    const user = getUserFromRequest(req);
    if (!user) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({
        success: false,
        message: 'Unauthorized',
      });
      return;
    }

    if (!user.installationId) {
      res.status(HTTP_STATUS_OK).json({
        success: true,
        data: {
          installed: false,
          live: {
            total: 0,
            byOutcome: { allow: 0, flag: 0, block: 0 },
            recent: [],
          },
          evalHarness: loadEvalHarnessLatest(),
        },
      });
      return;
    }

    const organizationId = await getOrganizationIdByInstallationId(user.installationId);
    if (!organizationId) {
      res.status(HTTP_STATUS_OK).json({
        success: true,
        data: {
          installed: true,
          live: {
            total: 0,
            byOutcome: { allow: 0, flag: 0, block: 0 },
            recent: [],
          },
          evalHarness: loadEvalHarnessLatest(),
        },
      });
      return;
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [grouped, recent] = await Promise.all([
      prisma.injectionDecision.groupBy({
        by: ['outcome'],
        where: { organizationId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.injectionDecision.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          outcome: true,
          scoreMalicious: true,
          scoreSafe: true,
          model: true,
          createdAt: true,
          reviewJobId: true,
        },
      }),
    ]);

    const byOutcome = { allow: 0, flag: 0, block: 0 };
    let total = 0;
    for (const row of grouped) {
      const key = row.outcome as keyof typeof byOutcome;
      if (key in byOutcome) {
        byOutcome[key] = row._count._all;
        total += row._count._all;
      }
    }

    res.status(HTTP_STATUS_OK).json({
      success: true,
      data: {
        installed: true,
        live: {
          windowDays: 30,
          total,
          byOutcome,
          recent: recent.map((r) => ({
            id: r.id,
            outcome: r.outcome,
            scoreMalicious: r.scoreMalicious,
            scoreSafe: r.scoreSafe,
            model: r.model,
            createdAt: r.createdAt.toISOString(),
            reviewJobId: r.reviewJobId,
          })),
        },
        evalHarness: loadEvalHarnessLatest(),
      },
    });
  })().catch(next);
});
