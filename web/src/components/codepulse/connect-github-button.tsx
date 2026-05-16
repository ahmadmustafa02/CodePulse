import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Github } from "lucide-react";
import { fetchSession, isLoggedIn, startGitHubOAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type ConnectGitHubButtonProps = {
  className?: string;
  label?: string;
  showArrow?: boolean;
};

export function ConnectGitHubButton({
  className,
  label = "Sign in with GitHub",
  showArrow = false,
}: ConnectGitHubButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const session = await fetchSession();
      if (isLoggedIn(session)) {
        await router.navigate({ to: "/dashboard" });
        return;
      }
      startGitHubOAuth();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => void handleClick()}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <Github className="size-4" />
      {loading ? "Checking…" : label}
      {showArrow && !loading ? <ArrowRight className="size-4" /> : null}
    </button>
  );
}
