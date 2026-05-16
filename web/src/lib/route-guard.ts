import { redirect } from "@tanstack/react-router";
import { fetchSession, isLoggedIn } from "@/lib/auth";

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
  const session = await fetchSession();
  if (!isLoggedIn(session)) {
    throw redirect({ to: "/", search: {} });
  }
}
