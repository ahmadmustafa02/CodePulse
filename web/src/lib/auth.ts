import { Capacitor } from "@capacitor/core";
import type { UserSession } from "@/types/api";
import { apiBaseUrl, getAuthMe, getSession, logout as apiLogout } from "@/lib/api";
import { clearStoredToken, getStoredToken, setNativeSessionValidated } from "@/lib/native-auth";

export type Session = UserSession;

export async function fetchSession(): Promise<Session | null> {
  if (Capacitor.isNativePlatform()) {
    const token = await getStoredToken();
    if (!token) {
      setNativeSessionValidated(false);
      return null;
    }
    try {
      const session = await getAuthMe();
      setNativeSessionValidated(true);
      return session;
    } catch {
      await clearStoredToken();
      setNativeSessionValidated(false);
      return null;
    }
  }

  try {
    return await getSession();
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await clearStoredToken();
    setNativeSessionValidated(false);
    return;
  }
  await apiLogout();
}

export function startGitHubOAuth(): void {
  if (Capacitor.isNativePlatform()) {
    return;
  }
  window.location.assign(`${apiBaseUrl}/auth/github`);
}

export function isLoggedIn(session: Session | null | undefined): boolean {
  return Boolean(session?.githubLogin);
}

export function hasInstallation(session: Session | null | undefined): boolean {
  return session?.installationId != null && session.installationId > 0;
}
