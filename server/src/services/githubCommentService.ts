/** Posts Groq analysis results as GitHub PR reviews and inline comments. */

import { Octokit } from '@octokit/rest';
import {
  GITHUB_REVIEW_EVENT_COMMENT,
  GITHUB_REVIEW_SIDE_RIGHT,
  HTTP_STATUS_UNPROCESSABLE_ENTITY,
} from '../config/constants';
import type { AnalysisResult, DetectedIssue } from '../types/analysis';
import {
  codePulseJobMarker,
  formatIssueComment,
  formatReviewSummary,
} from '../utils/commentFormatter';
import logger from '../utils/logger';
import { githubAuthService } from './githubAuthService';

type PostReviewParams = {
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  analysisResult: AnalysisResult;
  /** When set, comments are tagged and skipped if already posted for this job. */
  jobId?: string;
};

type ReviewComment = {
  path: string;
  line: number;
  side: typeof GITHUB_REVIEW_SIDE_RIGHT;
  body: string;
};

function isUnprocessableEntityError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: number }).status === HTTP_STATUS_UNPROCESSABLE_ENTITY
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildValidComments(issues: DetectedIssue[], jobId?: string): ReviewComment[] {
  return issues
    .filter((issue) => issue.line > 0)
    .map((issue) => ({
      path: issue.file,
      line: issue.line,
      side: GITHUB_REVIEW_SIDE_RIGHT,
      body: formatIssueComment(issue, jobId),
    }));
}

export class GitHubCommentService {
  /**
   * Posts a review for this analysis. Idempotent when `jobId` is provided.
   *
   * Primary path: one atomic `pulls.createReview` (all comments + body with marker).
   * Fallback (HTTP 422): per-comment loop — each inline body already includes the
   * job marker as it is posted; `hasPostedForJob` also scans review comments so a
   * mid-loop crash still skips on retry.
   */
  async postReview(params: PostReviewParams): Promise<void> {
    const { installationId, owner, repo, pullNumber, headSha, analysisResult, jobId } = params;
    const fullRepo = `${owner}/${repo}`;

    try {
      const token = await githubAuthService.getInstallationToken(installationId);
      const octokit = new Octokit({ auth: token });

      if (jobId && (await this.hasPostedForJob(octokit, { owner, repo, pullNumber, jobId }))) {
        logger.info('Skipping comment post; job marker already present on PR', {
          owner,
          repo,
          pullNumber,
          jobId,
        });
        return;
      }

      if (analysisResult.issues.length === 0) {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pullNumber,
          body: formatReviewSummary([], fullRepo, pullNumber, jobId),
        });
        logger.info('No issues found, posted clean review comment', {
          owner,
          repo,
          pullNumber,
          jobId,
        });
        return;
      }

      const comments = buildValidComments(analysisResult.issues, jobId);
      const summaryBody = formatReviewSummary(analysisResult.issues, fullRepo, pullNumber, jobId);

      try {
        await octokit.rest.pulls.createReview({
          owner,
          repo,
          pull_number: pullNumber,
          commit_id: headSha,
          event: GITHUB_REVIEW_EVENT_COMMENT,
          body: summaryBody,
          comments,
        });
      } catch (error) {
        if (!isUnprocessableEntityError(error)) {
          throw error;
        }

        logger.warn('Batch PR review failed with 422, retrying comments individually', {
          owner,
          repo,
          pullNumber,
          error: getErrorMessage(error),
        });

        await this.postCommentsIndividually(octokit, {
          owner,
          repo,
          pullNumber,
          headSha,
          comments,
        });

        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pullNumber,
          body: summaryBody,
        });
      }

      logger.info('GitHub PR review posted', {
        owner,
        repo,
        pullNumber,
        commentsPosted: comments.length,
        jobId,
        reviewUrl: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
      });
    } catch (error) {
      logger.error('Failed to post GitHub PR review', {
        owner,
        repo,
        pullNumber,
        jobId,
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  private async hasPostedForJob(
    octokit: Octokit,
    params: { owner: string; repo: string; pullNumber: number; jobId: string },
  ): Promise<boolean> {
    const marker = codePulseJobMarker(params.jobId);

    const issueComments = await octokit.rest.issues.listComments({
      owner: params.owner,
      repo: params.repo,
      issue_number: params.pullNumber,
      per_page: 100,
    });
    if (issueComments.data.some((c) => c.body?.includes(marker))) {
      return true;
    }

    const reviews = await octokit.rest.pulls.listReviews({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pullNumber,
      per_page: 100,
    });
    if (reviews.data.some((r) => r.body?.includes(marker))) {
      return true;
    }

    // Fallback path posts via createReviewComment (inline). Marker is on each
    // comment body as it goes out — check those so a mid-loop crash still skips.
    const reviewComments = await octokit.rest.pulls.listReviewComments({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pullNumber,
      per_page: 100,
    });
    if (reviewComments.data.some((c) => c.body?.includes(marker))) {
      return true;
    }

    return false;
  }

  private async postCommentsIndividually(
    octokit: Octokit,
    params: {
      owner: string;
      repo: string;
      pullNumber: number;
      headSha: string;
      comments: ReviewComment[];
    },
  ): Promise<void> {
    const { owner, repo, pullNumber, headSha, comments } = params;

    for (const comment of comments) {
      try {
        await octokit.rest.pulls.createReviewComment({
          owner,
          repo,
          pull_number: pullNumber,
          commit_id: headSha,
          path: comment.path,
          line: comment.line,
          side: comment.side,
          body: comment.body,
        });
      } catch (error) {
        logger.warn('Failed to post individual comment', {
          file: comment.path,
          line: comment.line,
          error: getErrorMessage(error),
        });
      }
    }
  }
}

export const githubCommentService = new GitHubCommentService();
