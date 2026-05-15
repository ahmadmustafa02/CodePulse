/** Processes validated GitHub webhook events asynchronously after HTTP acknowledgment. */

import { LOG_GROQ_PHASE_PLACEHOLDER, PR_ACTIONS_TO_PROCESS, SUPPORTED_EVENTS } from '../config/constants';
import type { WebhookEvent } from '../types/github';
import { githubDiffService } from './githubDiffService';
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
    const installationId = payload.installation?.id;

    if (installationId === undefined) {
      logger.error('No installation ID in payload', {
        deliveryId: event.deliveryId,
        repo: payload.repository.full_name,
        prNumber: payload.pull_request.number,
      });
      return;
    }

    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const pullNumber = payload.pull_request.number;
    const headSha = payload.pull_request.head.sha;

    logger.info('PR review pipeline started', {
      deliveryId: event.deliveryId,
      prNumber: pullNumber,
      repo: payload.repository.full_name,
      installationId,
    });

    try {
      const parsedDiff = await githubDiffService.fetchAndParseDiff({
        installationId,
        owner,
        repo,
        pullNumber,
        headSha,
      });

      logger.info('Diff parsed successfully', {
        prNumber: pullNumber,
        repo: `${owner}/${repo}`,
        filesChanged: parsedDiff.files.length,
        totalAdditions: parsedDiff.totalAdditions,
        totalDeletions: parsedDiff.totalDeletions,
        files: parsedDiff.files.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
        })),
      });

      logger.info(LOG_GROQ_PHASE_PLACEHOLDER, {
        deliveryId: event.deliveryId,
        prNumber: pullNumber,
        repo: `${owner}/${repo}`,
      });
    } catch (error) {
      logger.error('Failed to fetch or parse PR diff', {
        deliveryId: event.deliveryId,
        installationId,
        owner,
        repo,
        pullNumber,
        headSha,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}

export const webhookProcessor = new WebhookProcessor();
