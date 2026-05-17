/** Dashboard statistics API routes for the web frontend. */

import { Router } from 'express';
import { HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from '../config/constants';
import {
  getDashboardStats,
  getOrganizationIdByInstallationId,
  getRepositories,
  getReviews,
  getTeam,
} from '../services/statsService';
import { organizationLinkService } from '../services/organizationLinkService';
import { getUserFromRequest } from '../services/sessionService';
import logger from '../utils/logger';

export const statsRouter = Router();

const EMPTY_STATS = {
  totalPRs: 0,
  totalIssues: 0,
  criticalIssues: 0,
  cleanPRs: 0,
  issuesByCategory: [] as { category: string; count: number }[],
  issuesBySeverity: [] as { severity: string; count: number }[],
  recentReviews: [] as unknown[],
};

async function handleStatsRequest<T>(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
  handler: (organizationId: string) => Promise<T>,
  empty: T,
): Promise<void> {
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
      res.status(HTTP_STATUS_OK).json({ success: true, data: empty });
      return;
    }

    let organizationId = await getOrganizationIdByInstallationId(session.installationId);

    if (!organizationId) {
      await organizationLinkService.tryReconnectOrphanedData(
        session.installationId,
        session.githubLogin,
      );
      organizationId = await getOrganizationIdByInstallationId(session.installationId);
    }

    if (!organizationId) {
      logger.warn('Stats request: no organization for installation', {
        installationId: session.installationId,
        githubLogin: session.githubLogin,
      });
      res.status(HTTP_STATUS_OK).json({ success: true, data: empty });
      return;
    }

    logger.info('Stats request scoped to organization', {
      githubLogin: session.githubLogin,
      installationId: session.installationId,
      organizationId,
    });

    const data = await handler(organizationId);
    res.status(HTTP_STATUS_OK).json({ success: true, data });
  } catch (error) {
    logger.error('Stats route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

statsRouter.get('/stats', (req, res, next) => {
  void handleStatsRequest(req, res, next, getDashboardStats, EMPTY_STATS);
});

statsRouter.get('/repositories', (req, res, next) => {
  void handleStatsRequest(req, res, next, getRepositories, []);
});

statsRouter.get('/reviews', (req, res, next) => {
  void handleStatsRequest(req, res, next, getReviews, []);
});

statsRouter.get('/team', (req, res, next) => {
  void handleStatsRequest(req, res, next, getTeam, []);
});
