export type GitHubInstallationAccount = {
  login: string;
  type: 'User' | 'Organization' | 'Enterprise' | string;
};

export type GitHubInstallationDetails = {
  id: number;
  account: GitHubInstallationAccount;
};
