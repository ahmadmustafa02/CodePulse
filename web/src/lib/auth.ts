import type { UserSession } from "@/types/api";
import { apiBaseUrl, getSession, logout as apiLogout } from "@/lib/api";

export type Session = UserSession;

export async function fetchSession(): Promise<Session | null> {
  try {
    return await getSession();
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  await apiLogout();
}

export function startGitHubOAuth(): void {
  window.location.assign(`${apiBaseUrl}/auth/github`);
}

export function isLoggedIn(session: Session | null | undefined): boolean {
  return Boolean(session?.githubLogin);
}

export function hasInstallation(session: Session | null | undefined): boolean {
  return session?.installationId != null && session.installationId > 0;
}
