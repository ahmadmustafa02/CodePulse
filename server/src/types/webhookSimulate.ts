/** Request body for the Antigravity webhook simulation endpoint. */

export type WebhookSimulateBody = {
  repoOwner?: string;
  repoName?: string;
  prNumber?: number;
  developerName?: string;
  changedFiles?: string[];
  diffContent?: string;
};
