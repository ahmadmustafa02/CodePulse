/** Processes validated GitHub webhook events asynchronously after HTTP acknowledgment. */

import { PR_ACTIONS_TO_PROCESS, SUPPORTED_EVENTS } from '../config/constants';
import type { WebhookEvent } from '../types/github';
import { databaseService } from './databaseService';
import { githubCommentService } from './githubCommentService';
import { githubDiffService } from './githubDiffService';
import { groqAnalysisService } from './groqAnalysisService';
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
        prTitle: payload.pull_request.title,
        prDescription: payload.pull_request.body ?? '',
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

      const analysisResult = await groqAnalysisService.analyzeDiff(parsedDiff);

      logger.info('Analysis complete', {
        prNumber: pullNumber,
        repo: `${owner}/${repo}`,
        issuesFound: analysisResult.issues.length,
        breakdown: analysisResult.issues.reduce<Record<string, number>>((acc, issue) => {
          acc[issue.severity] = (acc[issue.severity] ?? 0) + 1;
          return acc;
        }, {}),
        issues: analysisResult.issues.map((issue) => ({
          file: issue.file,
          line: issue.line,
          severity: issue.severity,
          category: issue.category,
          title: issue.title,
        })),
      });

      await githubCommentService.postReview({
        installationId,
        owner,
        repo,
        pullNumber,
        headSha,
        analysisResult,
      });

      logger.info('PR review pipeline complete', {
        deliveryId: event.deliveryId,
        prNumber: pullNumber,
        repo: `${owner}/${repo}`,
        issuesFound: analysisResult.issues.length,
        reviewPosted: true,
      });

      try {
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

        const developer = await databaseService.upsertDeveloper({
          githubLogin: payload.pull_request.user.login,
          githubUserId: payload.pull_request.user.id,
          avatarUrl: payload.pull_request.user.avatar_url,
          organizationId: organization.id,
        });

        const pullRequest = await databaseService.upsertPullRequest({
          githubPrId: payload.pull_request.id,
          prNumber: payload.pull_request.number,
          title: payload.pull_request.title,
          headSha: payload.pull_request.head.sha,
          baseBranch: payload.pull_request.base.ref,
          headBranch: payload.pull_request.head.ref,
          organizationId: organization.id,
          repositoryId: repository.id,
          developerId: developer.id,
        });

        if (analysisResult.issues.length > 0) {
          const issueData = analysisResult.issues.map((issue) => ({
            file: issue.file,
            line: issue.line,
            category: issue.category,
            severity: issue.severity,
            title: issue.title,
            explanation: issue.explanation,
            suggestion: issue.suggestion,
            codeSnippet: issue.codeSnippet,
            organizationId: organization.id,
            pullRequestId: pullRequest.id,
            developerId: developer.id,
          }));
          await databaseService.createIssues(issueData);
        }

        logger.info('PR data saved to database', {
          prNumber: pullNumber,
          repo: `${owner}/${repo}`,
          issuesSaved: analysisResult.issues.length,
        });
      } catch (dbError) {
        logger.error('Failed to save PR data to database', {
          error: dbError instanceof Error ? dbError.message : String(dbError),
          stack: dbError instanceof Error ? dbError.stack : undefined,
          prNumber: pullNumber,
          repo: `${owner}/${repo}`,
        });
      }
    } catch (error) {
      logger.error('Failed to process pull request', {
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
