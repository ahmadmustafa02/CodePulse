import { Capacitor } from "@capacitor/core";
import { redirect } from "@tanstack/react-router";
import { fetchSession, isLoggedIn } from "@/lib/auth";
import { defaultLandingSearch } from "@/lib/constants";
import { getStoredToken } from "@/lib/native-auth";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export async function redirectIfLoggedIn(): Promise<void> {
  if (!isBrowser()) return;
  const session = await fetchSession();
  if (isLoggedIn(session)) {
    throw redirect({ to: "/dashboard" });
  }
}

export async function ensureLoggedIn(): Promise<void> {
  if (!isBrowser()) return;
  if (Capacitor.isNativePlatform()) {
    const token = await getStoredToken();
    if (!token) {
      throw redirect({ to: "/mobile-sign-in" });
    }
  }
  const session = await fetchSession();
  if (!isLoggedIn(session)) {
    if (Capacitor.isNativePlatform()) {
      throw redirect({ to: "/mobile-sign-in" });
    }
    throw redirect({ to: "/", search: defaultLandingSearch });
  }
}
