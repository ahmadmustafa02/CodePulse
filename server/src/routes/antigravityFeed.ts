/** Antigravity dashboard feed: recent traces & queued habit interventions. */

import { Router } from 'express';
import { HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from '../config/constants';
import { databaseService } from '../services/databaseService';
import { getOrganizationIdByInstallationId } from '../services/statsService';
import { getUserFromRequest } from '../services/sessionService';
import { describeAntigravityTraceLine } from '../utils/antigravityStatus';
import logger from '../utils/logger';

export const antigravityFeedRouter = Router();

antigravityFeedRouter.get('/recent-traces', async (req, res, next) => {
  try {
    const session = getUserFromRequest(req);
    if (!session) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'Sign in required' });
      return;
    }
    if (session.installationId === null) {
      res.status(HTTP_STATUS_OK).json({ success: true, data: [] });
      return;
    }
    const organizationId = await getOrganizationIdByInstallationId(session.installationId);
    if (!organizationId) {
      res.status(HTTP_STATUS_OK).json({ success: true, data: [] });
      return;
    }

    const rows = await databaseService.listRecentAgentTracesForOrganization(organizationId, 18);
    const data = rows.map((r) => ({
      traceId: r.traceId,
      pullRequestId: r.pullRequestId,
      prNumber: r.prNumber,
      prTitle: r.prTitle,
      repoFullName: r.repoFullName,
      statusLine: describeAntigravityTraceLine(r.prNumber, r.repoFullName, r.logs),
      sessionStartedAt: r.sessionStartedAt.toISOString(),
    }));

    res.status(HTTP_STATUS_OK).json({ success: true, data });
  } catch (error) {
    logger.error('GET antigravity recent-traces failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});

antigravityFeedRouter.get('/queued-interventions/:developerId', async (req, res, next) => {
  try {
    const session = getUserFromRequest(req);
    if (!session) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'Sign in required' });
      return;
    }
    if (session.installationId === null) {
      res.status(HTTP_STATUS_OK).json({ success: true, data: [] });
      return;
    }
    const organizationId = await getOrganizationIdByInstallationId(session.installationId);
    if (!organizationId) {
      res.status(HTTP_STATUS_OK).json({ success: true, data: [] });
      return;
    }

    const { developerId } = req.params;
    if (!developerId?.trim()) {
      res.status(HTTP_STATUS_OK).json({ success: true, data: [] });
      return;
    }

    const rows = await databaseService.listQueuedCustomInterventionsForDeveloper({
      organizationId,
      developerId: developerId.trim(),
    });

    const data = rows.map((r) => ({
      id: r.id,
      lessonTitle: r.lessonTitle,
      lessonMarkdown: r.lessonMarkdown,
      targetPillar: r.targetPillar,
      targetSunday: r.targetSunday.toISOString(),
      status: r.status,
    }));

    res.status(HTTP_STATUS_OK).json({ success: true, data });
  } catch (error) {
    logger.error('GET antigravity queued-interventions failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});
