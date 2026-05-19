/** Digest API routes for triggering weekly developer review emails. */

import { Router } from 'express';
import { z } from 'zod';
import {
  DIGEST_HEALTH_ROUTE,
  DIGEST_PREFERENCES_ROUTE,
  DIGEST_TRIGGER_ROUTE,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_OK,
  HTTP_STATUS_UNAUTHORIZED,
} from '../config/constants';
import { verifyDigestSecret } from '../middleware/verifyDigestSecret';
import { digestService } from '../services/digestService';
import { getUserFromRequest } from '../services/sessionService';
import logger from '../utils/logger';

const triggerBodySchema = z.object({
  organizationId: z.string().optional(),
});

const preferencesBodySchema = z.object({
  digestEmailEnabled: z.boolean(),
});

export const digestRouter = Router();

digestRouter.get(DIGEST_HEALTH_ROUTE, (_req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', message: 'Digest service ready' },
  });
});

digestRouter.get(DIGEST_PREFERENCES_ROUTE, async (req, res) => {
  const session = getUserFromRequest(req);
  if (!session) {
    res.status(HTTP_STATUS_UNAUTHORIZED).json({
      success: false,
      message: 'Sign in required',
    });
    return;
  }

  const preferences = await digestService.getPreferences(BigInt(session.githubUserId));
  if (!preferences) {
    res.status(HTTP_STATUS_UNAUTHORIZED).json({
      success: false,
      message: 'User not found',
    });
    return;
  }

  res.status(HTTP_STATUS_OK).json({ success: true, data: preferences });
});

digestRouter.patch(DIGEST_PREFERENCES_ROUTE, async (req, res, next) => {
  try {
    const session = getUserFromRequest(req);
    if (!session) {
      res.status(HTTP_STATUS_UNAUTHORIZED).json({
        success: false,
        message: 'Sign in required',
      });
      return;
    }

    const parsed = preferencesBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        success: false,
        error: {
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    const data = await digestService.setPreferences(
      BigInt(session.githubUserId),
      parsed.data.digestEmailEnabled,
    );

    res.status(HTTP_STATUS_OK).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

digestRouter.post(DIGEST_TRIGGER_ROUTE, verifyDigestSecret, async (req, res, next) => {
  try {
    const parsed = triggerBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        success: false,
        error: {
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    const result = await digestService.runWeeklyDigest(parsed.data.organizationId);
    const success = result.errors.length === 0;

    logger.info('Weekly digest run finished', {
      success,
      organizationId: result.organizationId,
      organizationsProcessed: result.organizationsProcessed,
      developerCount: result.developerCount,
      digestsSent: result.digestsSent,
      skippedNoEmail: result.skippedNoEmail,
      skippedOptOut: result.skippedOptOut,
      errorCount: result.errors.length,
    });

    res.status(HTTP_STATUS_OK).json({ success, data: result });
  } catch (error) {
    next(error);
  }
});
