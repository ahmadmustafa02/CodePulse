/** Processes validated GitHub webhook events asynchronously after HTTP acknowledgment. */

import { PR_ACTIONS_TO_PROCESS, SUPPORTED_EVENTS } from '../config/constants';
import type { WebhookEvent } from '../types/github';
import logger from '../utils/logger';

function isSupportedEvent(eventType: string): boolean {
  return (SUPPORTED_EVENTS as readonly string[]).includes(eventType);
}

function isProcessableAction(action: string): boolean {
  return (PR_ACTIONS_TO_PROCESS as readonly string[]).includes(action);
}

export class WebhookProcessor {
  async process(event: WebhookEvent): Promise<void> {
    try {
      if (!isSupportedEvent(event.eventType)) {
        logger.info('GitHub webhook event ignored', {
          eventType: event.eventType,
          deliveryId: event.deliveryId,
          reason: 'unsupported_event',
        });
        return;
      }

      if (!isProcessableAction(event.payload.action)) {
        logger.info('GitHub webhook action ignored', {
          eventType: event.eventType,
          deliveryId: event.deliveryId,
          action: event.payload.action,
          reason: 'unsupported_action',
        });
        return;
      }

      const { payload } = event;
      logger.info('GitHub webhook processing pull request', {
        eventType: event.eventType,
        deliveryId: event.deliveryId,
        action: payload.action,
        repo: payload.repository.full_name,
        prNumber: payload.number,
        prTitle: payload.pull_request.title,
        author: payload.pull_request.user.login,
      });

      await this.handlePullRequest(event);
    } catch (error) {
      logger.error('GitHub webhook processing failed', {
        deliveryId: event.deliveryId,
        eventType: event.eventType,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  private async handlePullRequest(event: WebhookEvent): Promise<void> {
    const { payload } = event;
    logger.info('PR review pipeline started', {
      deliveryId: event.deliveryId,
      prNumber: payload.number,
      repo: payload.repository.full_name,
    });
    logger.info('PR diff fetch would happen here', {
      deliveryId: event.deliveryId,
      prNumber: payload.number,
      repo: payload.repository.full_name,
    });
  }
}

export const webhookProcessor = new WebhookProcessor();
