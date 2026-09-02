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
  void (async () => {
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

      const event: WebhookEvent = { eventType, deliveryId, payload };

      // ACK immediately so GitHub does not hit client timeout while Neon/Redis wake.
      // Signature already verified; processing continues in-process after the response.
      res.status(HTTP_STATUS_ACCEPTED).json({
        success: true,
        data: { message: 'Webhook accepted', deliveryId },
      });

      try {
        await webhookProcessor.process(event);
      } catch (error) {
        logger.error('Webhook processing failed after ACK', {
          deliveryId,
          eventType,
          action: payload.action,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    } catch (error) {
      if (!res.headersSent) {
        next(error);
        return;
      }
      logger.error('Webhook handler failed after headers sent', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
