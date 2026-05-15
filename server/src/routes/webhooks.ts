/** GitHub webhook routes with raw body parsing and HMAC signature verification. */

import express, { Router } from 'express';
import { GITHUB_WEBHOOK_ROUTE, HTTP_STATUS_ACCEPTED, JSON_BODY_LIMIT } from '../config/constants';
import { extractWebhookHeaders } from '../middleware/extractWebhookHeaders';
import { verifyGitHubSignature } from '../middleware/verifyGitHubSignature';
import { webhookProcessor } from '../services/webhookProcessor';
import type { PullRequestWebhookPayload, WebhookEvent } from '../types/github';
import type { WebhookLocals } from '../types/express';
import logger from '../utils/logger';

export const webhooksRouter = Router();

webhooksRouter.use(express.raw({ type: 'application/json', limit: JSON_BODY_LIMIT }));
webhooksRouter.use(extractWebhookHeaders);
webhooksRouter.use(verifyGitHubSignature);

webhooksRouter.post(GITHUB_WEBHOOK_ROUTE, (req, res, next) => {
  try {
    const { eventType, deliveryId } = res.locals as WebhookLocals;
    const payload = req.body as PullRequestWebhookPayload;

    logger.info('GitHub webhook received', {
      eventType,
      deliveryId,
      action: payload.action,
      repo: payload.repository.full_name,
      prNumber: payload.number,
    });

    res.status(HTTP_STATUS_ACCEPTED).json({
      success: true,
      data: { message: 'Webhook received', deliveryId },
    });

    const event: WebhookEvent = { eventType, deliveryId, payload };
    void webhookProcessor.process(event).catch((error: unknown) => {
      logger.error('Async webhook processing failed', {
        deliveryId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });
  } catch (error) {
    next(error);
  }
});
