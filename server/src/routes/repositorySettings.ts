/** Repository-scoped escalation settings (team lead email, Resend alerts). */

import express, { Router } from 'express';
import { z } from 'zod';
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_OK,
  HTTP_STATUS_UNAUTHORIZED,
} from '../config/constants';
import { databaseService } from '../services/databaseService';
import { getOrganizationIdByInstallationId } from '../services/statsService';
import { getUserFromRequest, ensureBearerNotInvalid } from '../services/sessionService';
import logger from '../utils/logger';

export const repositorySettingsRouter = Router();
const jsonParser = express.json({ limit: '256kb' });

const patchBodySchema = z.object({
  teamLeadEmail: z.union([z.string().max(320), z.null()]).optional(),
  escalationEnabled: z.boolean().optional(),
});

repositorySettingsRouter.get('/:repositoryId', async (req, res, next) => {
  try {
    const auth = await getUserFromRequest(req);
    if (!ensureBearerNotInvalid(auth, res)) return;
    if (auth.type === 'none') {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'Sign in required' });
      return;
    }
    const session = auth.session;
    if (session.installationId === null) {
      res.status(404).json({ success: false, message: 'GitHub installation required' });
      return;
    }
    const organizationId = await getOrganizationIdByInstallationId(session.installationId);
    if (!organizationId) {
      res.status(404).json({ success: false, message: 'Organization not found' });
      return;
    }

    const { repositoryId } = req.params;
    if (!repositoryId?.trim()) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({ success: false, message: 'Invalid repository id' });
      return;
    }

    const owned = await databaseService.assertRepositoryInOrganization(
      repositoryId.trim(),
      organizationId,
    );
    if (!owned) {
      res.status(404).json({ success: false, message: 'Repository not found' });
      return;
    }

    const row = await databaseService.getRepositorySettingsByRepositoryId(repositoryId.trim());
    res.status(HTTP_STATUS_OK).json({
      success: true,
      data: {
        teamLeadEmail: row?.teamLeadEmail ?? null,
        escalationEnabled: row?.escalationEnabled ?? false,
      },
    });
  } catch (error) {
    logger.error('GET repository-settings failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});

repositorySettingsRouter.patch('/:repositoryId', jsonParser, async (req, res, next) => {
  try {
    const auth = await getUserFromRequest(req);
    if (!ensureBearerNotInvalid(auth, res)) return;
    if (auth.type === 'none') {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({ success: false, message: 'Sign in required' });
      return;
    }
    const session = auth.session;
    if (session.installationId === null) {
      res.status(404).json({ success: false, message: 'GitHub installation required' });
      return;
    }
    const organizationId = await getOrganizationIdByInstallationId(session.installationId);
    if (!organizationId) {
      res.status(404).json({ success: false, message: 'Organization not found' });
      return;
    }

    const { repositoryId } = req.params;
    if (!repositoryId?.trim()) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({ success: false, message: 'Invalid repository id' });
      return;
    }

    const parsed = patchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        success: false,
        message: 'Invalid request body',
      });
      return;
    }

    const existing = await databaseService.getRepositorySettingsByRepositoryId(repositoryId.trim());
    const nextEmail =
      parsed.data.teamLeadEmail !== undefined
        ? parsed.data.teamLeadEmail === null
          ? null
          : parsed.data.teamLeadEmail.trim() === ''
            ? null
            : parsed.data.teamLeadEmail.trim()
        : (existing?.teamLeadEmail ?? null);

    const nextEscalation =
      parsed.data.escalationEnabled !== undefined
        ? parsed.data.escalationEnabled
        : (existing?.escalationEnabled ?? false);

    const row = await databaseService.upsertRepositorySettings({
      repositoryId: repositoryId.trim(),
      organizationId,
      teamLeadEmail: nextEmail,
      escalationEnabled: nextEscalation,
    });

    res.status(HTTP_STATUS_OK).json({
      success: true,
      data: {
        teamLeadEmail: row.teamLeadEmail,
        escalationEnabled: row.escalationEnabled,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Repository not found for organization') {
      res.status(404).json({ success: false, message: 'Repository not found' });
      return;
    }
    logger.error('PATCH repository-settings failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
});
