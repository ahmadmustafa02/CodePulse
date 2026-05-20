import { createFileRoute, redirect } from "@tanstack/react-router";
import { defaultLandingSearch } from "@/lib/constants";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: defaultLandingSearch });
  },
});
