/** Posts Groq analysis results as GitHub PR reviews and inline comments. */

import { Octokit } from '@octokit/rest';
import {
  GITHUB_REVIEW_EVENT_COMMENT,
  GITHUB_REVIEW_SIDE_RIGHT,
  HTTP_STATUS_UNPROCESSABLE_ENTITY,
} from '../config/constants';
import type { AnalysisResult, DetectedIssue } from '../types/analysis';
import { formatIssueComment, formatReviewSummary } from '../utils/commentFormatter';
import logger from '../utils/logger';
import { githubAuthService } from './githubAuthService';

type PostReviewParams = {
  installationId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  analysisResult: AnalysisResult;
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

function buildValidComments(issues: DetectedIssue[]): ReviewComment[] {
  return issues
    .filter((issue) => issue.line > 0)
    .map((issue) => ({
      path: issue.file,
      line: issue.line,
      side: GITHUB_REVIEW_SIDE_RIGHT,
      body: formatIssueComment(issue),
    }));
}

export class GitHubCommentService {
  async postReview(params: PostReviewParams): Promise<void> {
    const { installationId, owner, repo, pullNumber, headSha, analysisResult } = params;
    const fullRepo = `${owner}/${repo}`;

    try {
      const token = await githubAuthService.getInstallationToken(installationId);
      const octokit = new Octokit({ auth: token });

      if (analysisResult.issues.length === 0) {
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: pullNumber,
          body: formatReviewSummary([], fullRepo, pullNumber),
        });
        logger.info('No issues found, posted clean review comment', {
          owner,
          repo,
          pullNumber,
        });
        return;
      }

      const comments = buildValidComments(analysisResult.issues);
      const summaryBody = formatReviewSummary(analysisResult.issues, fullRepo, pullNumber);

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
        reviewUrl: `https://github.com/${owner}/${repo}/pull/${pullNumber}`,
      });
    } catch (error) {
      logger.error('Failed to post GitHub PR review', {
        owner,
        repo,
        pullNumber,
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
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
