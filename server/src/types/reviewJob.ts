/** Review queue job payload stored on ReviewJob and passed through BullMQ. */

export type ReviewJobPayload = {
  installationId: number;
  deliveryId: string;
  action: string;
  owner: string;
  repo: string;
  fullName: string;
  githubRepoId: number;
  private: boolean;
  pullNumber: number;
  githubPrId: number;
  title: string;
  body: string;
  headSha: string;
  baseBranch: string;
  headBranch: string;
  state: string;
  authorLogin: string;
  authorId: number;
  authorAvatarUrl: string;
};

export const REVIEW_JOB_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'dead',
] as const;

export type ReviewJobStatus = (typeof REVIEW_JOB_STATUSES)[number];

export const REVIEW_QUEUE_NAME = 'codepulse-review';
export const REVIEW_JOB_MAX_ATTEMPTS = 3;
export const REVIEW_JOB_BACKOFF_MS = 5000;
