/** Digest API routes for triggering weekly developer review emails. */

import { Router } from 'express';
import { z } from 'zod';
import {
  DIGEST_HEALTH_ROUTE,
  DIGEST_TRIGGER_ROUTE,
  HTTP_STATUS_OK,
} from '../config/constants';
import { verifyDigestSecret } from '../middleware/verifyDigestSecret';
import { digestService } from '../services/digestService';

const triggerBodySchema = z.object({
  organizationId: z.string().optional(),
});

export const digestRouter = Router();

digestRouter.get(DIGEST_HEALTH_ROUTE, (_req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', message: 'Digest service ready' },
  });
});

digestRouter.post(DIGEST_TRIGGER_ROUTE, verifyDigestSecret, async (req, res, next) => {
  try {
    const parsed = triggerBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: {
          message: parsed.error.issues.map((issue) => issue.message).join('; '),
          code: 'VALIDATION_ERROR',
        },
      });
      return;
    }

    const result = await digestService.runWeeklyDigest(parsed.data.organizationId);
    res.status(HTTP_STATUS_OK).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
