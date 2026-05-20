/** Agent trace polling for the Antigravity / AgentConsole UI. */

import { Router } from 'express';
import { HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from '../config/constants';
import { databaseService } from '../services/databaseService';
import { getOrganizationIdByInstallationId } from '../services/statsService';
import { getUserFromRequest, ensureBearerNotInvalid } from '../services/sessionService';
import logger from '../utils/logger';

export const tracesRouter = Router();

tracesRouter.get('/:pullRequestId', async (req, res, next) => {
  try {
    const auth = await getUserFromRequest(req);
    if (!ensureBearerNotInvalid(auth, res)) return;
    if (auth.type === 'none') {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({
        success: false,
        message: 'Sign in required',
      });
      return;
    }
    const session = auth.session;
    if (session.installationId === null) {
      res.status(404).json({
        success: false,
        message: 'GitHub installation required',
      });
      return;
    }

    const organizationId = await getOrganizationIdByInstallationId(session.installationId);
    if (!organizationId) {
      res.status(404).json({
        success: false,
        message: 'Organization not found',
      });
      return;
    }

    const { pullRequestId } = req.params;
    if (!pullRequestId || pullRequestId.trim().length === 0) {
      res.status(404).json({
        success: false,
        message: 'Invalid pull request id',
      });
      return;
    }

    const { logs, traceId, pullRequestExists } = await databaseService.getAgentTraceLogsForOrganization({
      organizationId,
      pullRequestId: pullRequestId.trim(),
    });

    if (!pullRequestExists) {
      res.status(404).json({
        success: false,
        message: 'Pull request not found',
      });
      return;
    }

    res.status(HTTP_STATUS_OK).json({
      success: true,
      data: {
        logs,
        traceId,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Traces route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});
