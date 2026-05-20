export const GITHUB_APP_INSTALL_URL =
  "https://github.com/apps/pulsecommit/installations/new";

export function githubInstallationSettingsUrl(installationId: number): string {
  return `https://github.com/settings/installations/${installationId}`;
}

/** Required search shape for `/` (see `routes/index.tsx` `validateSearch`). */
export const defaultLandingSearch: { error: string | undefined } = { error: undefined };
