/** Processes validated GitHub webhook events: lifecycle sync or enqueue review jobs. */

import { PR_ACTIONS_TO_PROCESS, SUPPORTED_EVENTS } from '../config/constants';
import {
  resolvePullRequestLifecycleState,
  type WebhookEvent,
} from '../types/github';
import type { ReviewJobPayload } from '../types/reviewJob';
import { databaseService } from './databaseService';
import { enqueueReviewJob } from './queue';
import { reviewJobService } from './reviewJobService';
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

      // Closed/merged events update lifecycle state only — never the AI review pipeline.
      if (event.payload.action === 'closed') {
        await this.syncPullRequestLifecycleState(event);
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
      logger.info('GitHub webhook enqueueing pull request review', {
        eventType: event.eventType,
        deliveryId: event.deliveryId,
        action: payload.action,
        repo: payload.repository.full_name,
        prNumber: payload.number,
        prTitle: payload.pull_request.title,
        author: payload.pull_request.user.login,
      });

      await this.enqueuePullRequestReview(event);
    } catch (error) {
      logger.error('GitHub webhook processing failed', {
        deliveryId: event.deliveryId,
        eventType: event.eventType,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private async syncPullRequestLifecycleState(event: WebhookEvent): Promise<void> {
    const { payload } = event;
    const state = resolvePullRequestLifecycleState(payload.pull_request);

    try {
      const updated = await databaseService.updatePullRequestLifecycleState({
        githubRepoId: payload.repository.id,
        githubPrId: payload.pull_request.id,
        state,
        title: payload.pull_request.title,
      });

      if (!updated) {
        logger.info('PR lifecycle sync skipped; pull request not in database', {
          deliveryId: event.deliveryId,
          repo: payload.repository.full_name,
          prNumber: payload.pull_request.number,
          state,
          action: payload.action,
        });
        return;
      }

      logger.info('PR lifecycle state updated', {
        deliveryId: event.deliveryId,
        repo: payload.repository.full_name,
        prNumber: payload.pull_request.number,
        state,
        action: payload.action,
      });
    } catch (error) {
      logger.error('Failed to sync PR lifecycle state', {
        deliveryId: event.deliveryId,
        repo: payload.repository.full_name,
        prNumber: payload.pull_request.number,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async enqueuePullRequestReview(event: WebhookEvent): Promise<void> {
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
    const headSha = payload.pull_request.head.sha;
    const pullNumber = payload.pull_request.number;

    const organization = await databaseService.upsertOrganization({
      githubInstallationId: installationId,
      name: owner,
    });

    const repository = await databaseService.upsertRepository({
      githubRepoId: payload.repository.id,
      name: payload.repository.name,
      fullName: payload.repository.full_name,
      private: payload.repository.private,
      organizationId: organization.id,
    });

    const jobPayload: ReviewJobPayload = {
      installationId,
      deliveryId: event.deliveryId,
      action: payload.action,
      owner,
      repo: payload.repository.name,
      fullName: payload.repository.full_name,
      githubRepoId: payload.repository.id,
      private: payload.repository.private,
      pullNumber,
      githubPrId: payload.pull_request.id,
      title: payload.pull_request.title,
      body: payload.pull_request.body ?? '',
      headSha,
      baseBranch: payload.pull_request.base.ref,
      headBranch: payload.pull_request.head.ref,
      state: resolvePullRequestLifecycleState(payload.pull_request),
      authorLogin: payload.pull_request.user.login,
      authorId: payload.pull_request.user.id,
      authorAvatarUrl: payload.pull_request.user.avatar_url,
    };

    const result = await reviewJobService.tryCreateJob({
      organizationId: organization.id,
      repoId: repository.id,
      prNumber: pullNumber,
      headSha,
      deliveryId: event.deliveryId,
      payload: jobPayload,
    });

    if (!result.created) {
      const existing = result.job;
      logger.info('Review job not created; unique head already exists', {
        deliveryId: event.deliveryId,
        repo: payload.repository.full_name,
        prNumber: pullNumber,
        headSha,
        existingJobId: existing?.id,
        existingStatus: existing?.status,
        reason: 'unique_constraint',
      });

      // If a prior insert never reached Redis, re-enqueue safely.
      // BullMQ jobId === ReviewJob.id makes this idempotent.
      if (existing && existing.status === 'queued') {
        try {
          await enqueueReviewJob(existing.id);
          logger.info('Re-enqueued stranded queued ReviewJob after unique hit', {
            reviewJobId: existing.id,
          });
        } catch (error) {
          logger.warn('Re-enqueue after unique hit failed', {
            reviewJobId: existing.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return;
    }

    try {
      await enqueueReviewJob(result.job.id);
    } catch (error) {
      // Keep row as queued so a later duplicate delivery or operator can re-enqueue.
      await reviewJobService.markEnqueueError(
        result.job.id,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }

    logger.info('Review job created and enqueued', {
      deliveryId: event.deliveryId,
      reviewJobId: result.job.id,
      repo: payload.repository.full_name,
      prNumber: pullNumber,
      headSha,
    });
  }
}

export const webhookProcessor = new WebhookProcessor();
