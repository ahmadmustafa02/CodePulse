/** Proposed code fixes for repository file paths (split-view UI). */

import { Router } from 'express';
import { HTTP_STATUS_BAD_REQUEST, HTTP_STATUS_OK, HTTP_STATUS_UNAUTHORIZED } from '../config/constants';
import { databaseService } from '../services/databaseService';
import { getOrganizationIdByInstallationId } from '../services/statsService';
import { getUserFromRequest } from '../services/sessionService';
import logger from '../utils/logger';

export const proposedFixesRouter = Router();

proposedFixesRouter.get('/', async (req, res, next) => {
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
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        success: false,
        message: 'GitHub installation required',
      });
      return;
    }

    const organizationId = await getOrganizationIdByInstallationId(session.installationId);
    if (!organizationId) {
      res.status(HTTP_STATUS_OK).json({ success: true, data: [] });
      return;
    }

    const repoFullName = typeof req.query.repo === 'string' ? req.query.repo.trim() : '';
    const filePath = typeof req.query.file === 'string' ? req.query.file.trim() : '';
    if (!repoFullName || !filePath) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        success: false,
        message: 'Query params "repo" and "file" are required',
      });
      return;
    }

    const data = await databaseService.getProposedCodeFixesForRepoFile({
      organizationId,
      repoFullName,
      filePath,
    });

    res.status(HTTP_STATUS_OK).json({ success: true, data });
  } catch (error) {
    logger.error('Proposed code fixes route failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});
