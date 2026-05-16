export const GITHUB_APP_INSTALL_URL =
  "https://github.com/apps/pulsecommit/installations/new";

export function githubInstallationSettingsUrl(installationId: number): string {
  return `https://github.com/settings/installations/${installationId}`;
}
