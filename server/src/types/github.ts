/** TypeScript types for GitHub webhook payloads and related API shapes. */

export type PullRequestAction =
  | 'opened'
  | 'closed'
  | 'synchronize'
  | 'reopened'
  | 'edited'
  | string;

export type GitHubUser = {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
};

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: GitHubUser;
  html_url: string;
  default_branch: string;
};

export type GitHubPullRequestRef = {
  sha: string;
  ref: string;
  repo: GitHubRepo;
};

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  html_url: string;
  diff_url: string;
  head: GitHubPullRequestRef;
  base: GitHubPullRequestRef;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
};

export type PullRequestWebhookPayload = {
  action: PullRequestAction;
  number: number;
  pull_request: GitHubPullRequest;
  repository: GitHubRepo;
  sender: GitHubUser;
  installation?: { id: number; node_id: string };
};

export type WebhookEvent = {
  eventType: string;
  deliveryId: string;
  payload: PullRequestWebhookPayload;
};
