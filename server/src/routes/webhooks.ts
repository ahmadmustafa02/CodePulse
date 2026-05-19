/** GitHub webhook routes with raw body parsing and HMAC signature verification. */

import express, { Router } from 'express';
import {
  GITHUB_WEBHOOK_ROUTE,
  GITHUB_WEBHOOK_SIMULATE_ROUTE,
  HTTP_STATUS_ACCEPTED,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_OK,
  JSON_BODY_LIMIT,
  SIMULATE_DEFAULT_CHANGED_FILES,
  SIMULATE_DEFAULT_DEVELOPER_NAME,
  SIMULATE_DEFAULT_DIFF_CONTENT,
  SIMULATE_DEFAULT_PR_NUMBER,
  SIMULATE_DEFAULT_REPO_NAME,
  SIMULATE_DEFAULT_REPO_OWNER,
} from '../config/constants';
import { extractWebhookHeaders } from '../middleware/extractWebhookHeaders';
import { verifyGitHubSignature } from '../middleware/verifyGitHubSignature';
import { runAntigravityWorkflow } from '../services/antigravityOrchestrator';
import { webhookProcessor } from '../services/webhookProcessor';
import { prisma } from '../services/prismaService';
import type { PullRequestWebhookPayload, WebhookEvent } from '../types/github';
import type { WebhookLocals } from '../types/express';
import type { WebhookSimulateBody } from '../types/webhookSimulate';
import logger from '../utils/logger';

export const webhooksRouter = Router();

const jsonParser = express.json({ limit: JSON_BODY_LIMIT });
const rawParser = express.raw({ type: 'application/json', limit: JSON_BODY_LIMIT });

webhooksRouter.post(GITHUB_WEBHOOK_SIMULATE_ROUTE, jsonParser, async (req, res, next) => {
  try {
    const {
      repoOwner: rawRepoOwner,
      repoName: rawRepoName,
      prNumber: rawPrNumber,
      developerName: rawDeveloperName,
      changedFiles: rawChangedFiles,
      diffContent: rawDiffContent,
    } = (req.body ?? {}) as WebhookSimulateBody;

    const repoOwner =
      typeof rawRepoOwner === 'string' && rawRepoOwner.trim().length > 0
        ? rawRepoOwner.trim()
        : SIMULATE_DEFAULT_REPO_OWNER;
    const repoName =
      typeof rawRepoName === 'string' && rawRepoName.trim().length > 0
        ? rawRepoName.trim()
        : SIMULATE_DEFAULT_REPO_NAME;
    const prNumber =
      typeof rawPrNumber === 'number' && Number.isInteger(rawPrNumber) && rawPrNumber > 0
        ? rawPrNumber
        : SIMULATE_DEFAULT_PR_NUMBER;
    const developerName =
      typeof rawDeveloperName === 'string' && rawDeveloperName.trim().length > 0
        ? rawDeveloperName.trim()
        : SIMULATE_DEFAULT_DEVELOPER_NAME;
    const changedFiles =
      Array.isArray(rawChangedFiles) && rawChangedFiles.length > 0
        ? rawChangedFiles
        : [...SIMULATE_DEFAULT_CHANGED_FILES];
    const diffContent =
      typeof rawDiffContent === 'string' && rawDiffContent.trim().length > 0
        ? rawDiffContent.trim()
        : SIMULATE_DEFAULT_DIFF_CONTENT;

    const repository = await prisma.repository.findFirst({
      where: { fullName: `${repoOwner}/${repoName}` },
    });

    if (!repository) {
      res.status(HTTP_STATUS_NOT_FOUND).json({
        success: false,
        message: `Repository ${repoOwner}/${repoName} not found. Install the GitHub App or pass a connected repoOwner/repoName.`,
      });
      return;
    }

    const repoId = repository.id;
    const prUrl = `https://github.com/${repoOwner}/${repoName}/pull/${prNumber}`;
    const fullName = `${repoOwner}/${repoName}`;

    logger.info('Antigravity live simulation started', {
      repoId,
      fullName,
      prNumber,
      developerName,
      changedFiles,
    });

    const result = await runAntigravityWorkflow(
      repoId,
      prNumber,
      prUrl,
      developerName,
      changedFiles,
      diffContent,
      {
        headSha: 'antigravity-simulate',
        prTitle: `Simulated PR #${prNumber}`,
        prDescription: `Antigravity live simulation by ${developerName}`,
        repo: fullName,
      },
    );

    res.status(HTTP_STATUS_OK).json({
      success: true,
      message: 'Antigravity Live Simulation Processed',
      data: result,
    });
  } catch (error) {
    logger.error('Webhook simulation failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    next(error);
  }
});

webhooksRouter.post(
  GITHUB_WEBHOOK_ROUTE,
  rawParser,
  extractWebhookHeaders,
  verifyGitHubSignature,
  (req, res, next) => {
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
  },
);
