import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const DEVICE_TOKEN_KEY = "device_token";

let nativeSessionValid = false;

export function setNativeSessionValidated(ok: boolean): void {
  nativeSessionValid = ok;
}

export async function getStoredToken(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const { value } = await Preferences.get({ key: DEVICE_TOKEN_KEY });
  return value ?? null;
}

export async function setStoredToken(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const trimmed = token.trim();
  await Preferences.set({ key: DEVICE_TOKEN_KEY, value: trimmed });
  nativeSessionValid = true;
}

export async function clearStoredToken(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await Preferences.remove({ key: DEVICE_TOKEN_KEY });
  nativeSessionValid = false;
}

export async function isNativeAuthenticated(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const token = await getStoredToken();
  return Boolean(token && nativeSessionValid);
}
