import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchAuthMeWithBearerToken } from "@/lib/api";
import { fetchSession, isLoggedIn } from "@/lib/auth";
import { defaultLandingSearch } from "@/lib/constants";
import { getStoredToken, setStoredToken } from "@/lib/native-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/codepulse/panel";

const SETTINGS_URL = "https://getcodepulse.vercel.app/settings";

export const Route = createFileRoute("/mobile-sign-in")({
  beforeLoad: async () => {
    if (!Capacitor.isNativePlatform()) {
      throw redirect({ to: "/", search: defaultLandingSearch });
    }
    const token = await getStoredToken();
    if (token) {
      const session = await fetchSession();
      if (isLoggedIn(session)) {
        throw redirect({ to: "/dashboard" });
      }
    }
  },
  head: () => ({ meta: [{ title: "Sign in · CodePulse" }] }),
  component: MobileSignInPage,
});

function MobileSignInPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function openSettingsPage() {
    window.open(SETTINGS_URL, "_blank", "noopener,noreferrer");
  }

  async function handleSignIn() {
    setError(null);
    const raw = tokenInput.trim();
    if (!raw.startsWith("cpat_")) {
      setError("Token should start with cpat_.");
      return;
    }
    setSubmitting(true);
    try {
      await fetchAuthMeWithBearerToken(raw);
      await setStoredToken(raw);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await router.navigate({ to: "/dashboard" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#09090b] px-6 py-16 font-sans text-zinc-400">
      <div className="mx-auto w-full max-w-md">
        <Panel>
          <h1 className="text-xl font-medium tracking-tight text-zinc-100">Sign in to CodePulse</h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">
            Generate a token at getcodepulse.vercel.app/settings and paste it below.
          </p>

          <div className="mt-8 space-y-2">
            <Label htmlFor="device-token" className="text-xs text-zinc-400">
              Device token
            </Label>
            <Input
              id="device-token"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="cpat_…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className="border-zinc-800 bg-zinc-950 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
            />
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
          </div>

          <Button
            type="button"
            className="mt-6 w-full bg-zinc-100 text-zinc-900 hover:bg-white"
            disabled={submitting || tokenInput.trim().length < 8}
            onClick={() => void handleSignIn()}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>

          <button
            type="button"
            onClick={() => void openSettingsPage()}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 text-sm text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline"
          >
            <ExternalLink className="size-4" />
            Open getcodepulse.vercel.app
          </button>
        </Panel>
      </div>
    </div>
  );
}
