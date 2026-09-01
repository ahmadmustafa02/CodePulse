/** Durable PR review pipeline executed by the BullMQ worker. */

import { resolvePullRequestLifecycleState } from '../types/github';
import type { ReviewJobPayload } from '../types/reviewJob';
import type { PipelineTracer } from './traceService';
import { hasCompletedStep } from './traceService';
import { findDecisionForJob, scanUntrustedContent } from '../defense';
import { databaseService } from './databaseService';
import { githubCommentService } from './githubCommentService';
import { githubDiffService } from './githubDiffService';
import { groqAnalysisService } from './groqAnalysisService';
import { refactorPrService } from './refactorPrService';
import { formatDiffForPrompt } from '../utils/diffFormatter';
import logger from '../utils/logger';

export class ReviewPipelineService {
  async run(params: {
    jobId: string;
    organizationId: string;
    payload: ReviewJobPayload;
    tracer: PipelineTracer;
  }): Promise<void> {
    const { jobId, organizationId, payload, tracer } = params;
    const {
      installationId,
      owner,
      repo,
      pullNumber,
      headSha,
      deliveryId,
    } = payload;

    logger.info('Review pipeline started', {
      jobId,
      deliveryId,
      prNumber: pullNumber,
      repo: payload.fullName,
      installationId,
      headSha,
    });

    // Acceptance-only hook: synthetic head SHAs never collide with GitHub hex SHAs.
    if (headSha.startsWith('cp-accept-fail-')) {
      throw new Error('Forced acceptance failure');
    }

    const alreadyProcessed = await databaseService.hasSuccessfullyProcessedPrHead({
      githubRepoId: payload.githubRepoId,
      prNumber: pullNumber,
      headSha,
    });
    if (alreadyProcessed) {
      logger.info('PR review skipped; head already persisted', {
        jobId,
        deliveryId,
        repo: payload.fullName,
        prNumber: pullNumber,
        headSha,
        reason: 'duplicate_pr_head',
      });
      return;
    }

    const parsedDiff = await this.runStepUnlessDone(jobId, 'fetch_diff', tracer, () =>
      githubDiffService.fetchAndParseDiff({
        installationId,
        owner,
        repo,
        pullNumber,
        headSha,
        prTitle: payload.title,
        prDescription: payload.body,
      }),
    );

    // If fetch_diff was skipped, we still need the diff for analysis — re-fetch without tracing.
    const diff =
      parsedDiff ??
      (await githubDiffService.fetchAndParseDiff({
        installationId,
        owner,
        repo,
        pullNumber,
        headSha,
        prTitle: payload.title,
        prDescription: payload.body,
      }));

    logger.info('Diff parsed successfully', {
      jobId,
      prNumber: pullNumber,
      repo: `${owner}/${repo}`,
      filesChanged: diff.files.length,
      totalAdditions: diff.totalAdditions,
      totalDeletions: diff.totalDeletions,
    });

    const gateResult = await this.runStepUnlessDone(
      jobId,
      'injection_scan',
      tracer,
      () =>
        scanUntrustedContent({
          title: payload.title,
          body: payload.body,
          filenames: diff.files.map((file) => file.filename),
          formattedDiffPreview: formatDiffForPrompt(diff),
          jobId,
          organizationId,
          installationId,
        }),
      { filesChanged: diff.files.length },
    );

    const injectionOutcome =
      gateResult?.outcome ??
      (await findDecisionForJob(jobId))?.outcome ??
      'allow';

    if (injectionOutcome === 'block') {
      await this.runStepUnlessDone(jobId, 'injection_block_comment', tracer, () =>
        githubCommentService.postSecuritySkipComment({
          installationId,
          owner,
          repo,
          pullNumber,
          jobId,
        }),
      );
      logger.info('PR review blocked by injection defense', {
        jobId,
        deliveryId,
        prNumber: pullNumber,
        repo: `${owner}/${repo}`,
        scoreMalicious: gateResult?.scoreMalicious,
        decisionId: gateResult?.decisionId,
      });
      return;
    }

    let analysisResult = await this.runStepUnlessDone(
      jobId,
      'analyze_diff',
      tracer,
      () => groqAnalysisService.analyzeDiff(diff, tracer),
      { filesChanged: diff.files.length },
    );

    if (!analysisResult) {
      // Prior analyze_diff completed but we don't store the result — re-run analysis cheaply
      // without duplicating the outer analyze_diff trace (inner triage/chunk traces may repeat).
      analysisResult = await groqAnalysisService.analyzeDiff(diff);
    }

    logger.info('Analysis complete', {
      jobId,
      prNumber: pullNumber,
      repo: `${owner}/${repo}`,
      issuesFound: analysisResult.issues.length,
    });

    const processedConcurrently = await databaseService.hasSuccessfullyProcessedPrHead({
      githubRepoId: payload.githubRepoId,
      prNumber: pullNumber,
      headSha,
    });
    if (processedConcurrently) {
      logger.info('PR review skipped before posting; head already processed', {
        jobId,
        deliveryId,
        repo: payload.fullName,
        prNumber: pullNumber,
        headSha,
        reason: 'duplicate_pr_head',
      });
      return;
    }

    await this.runStepUnlessDone(jobId, 'comment_post', tracer, () =>
      githubCommentService.postReview({
        installationId,
        owner,
        repo,
        pullNumber,
        headSha,
        analysisResult,
        jobId,
      }),
    );

    await this.runStepUnlessDone(jobId, 'persist', tracer, async () => {
      const organization = await databaseService.upsertOrganization({
        githubInstallationId: installationId,
        name: owner,
      });

      const repository = await databaseService.upsertRepository({
        githubRepoId: payload.githubRepoId,
        name: payload.repo,
        fullName: payload.fullName,
        private: payload.private,
        organizationId: organization.id,
      });

      const developer = await databaseService.upsertDeveloper({
        githubLogin: payload.authorLogin,
        githubUserId: payload.authorId,
        avatarUrl: payload.authorAvatarUrl,
        organizationId: organization.id,
      });

      const pullRequest = await databaseService.upsertPullRequest({
        githubPrId: payload.githubPrId,
        prNumber: payload.pullNumber,
        title: payload.title,
        headSha: payload.headSha,
        baseBranch: payload.baseBranch,
        headBranch: payload.headBranch,
        state: payload.state,
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
        jobId,
        prNumber: pullNumber,
        repo: `${owner}/${repo}`,
        issuesSaved: analysisResult.issues.length,
      });
    });

    // Phase 4: optional verified refactor PRs (org flag default OFF; caps before Groq/sandbox).
    // Uses organizationId from persist; re-resolve if persist was skipped on retry.
    await this.runStepUnlessDone(jobId, 'refactor_prs', tracer, async () => {
      const organization = await databaseService.upsertOrganization({
        githubInstallationId: installationId,
        name: owner,
      });
      await refactorPrService.maybeOpenRefactorPrs({
        jobId,
        organizationId: organization.id,
        payload,
        issues: analysisResult.issues,
        tracer,
      });
    });

    logger.info('PR review pipeline complete', {
      jobId,
      deliveryId,
      prNumber: pullNumber,
      repo: `${owner}/${repo}`,
      issuesFound: analysisResult.issues.length,
      reviewPosted: true,
    });
  }

  /** Runs `fn` inside a trace unless this job already completed `step`. */
  private async runStepUnlessDone<T>(
    jobId: string,
    step: string,
    tracer: PipelineTracer,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>,
  ): Promise<T | null> {
    if (await hasCompletedStep(jobId, step)) {
      logger.info('Skipping completed pipeline step on retry', { jobId, step });
      return null;
    }
    return tracer.run(step, fn, metadata);
  }
}

export function buildPayloadState(pr: {
  state: 'open' | 'closed';
  merged?: boolean;
  merged_at: string | null;
}): string {
  return resolvePullRequestLifecycleState(pr);
}

export const reviewPipelineService = new ReviewPipelineService();
