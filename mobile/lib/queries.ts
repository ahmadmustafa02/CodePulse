import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildDigest,
  buildLatencyFromStats,
  buildPrVolumeFromReviews,
  mapDeveloper,
  mapRepo,
  mapReviewToPull,
  splitFullName,
} from "./aggregates";
import {
  getAgentTracesForPullRequest,
  getAuthMe,
  getDigestPreferences,
  getEscalations,
  getRecentAntigravityTraceFeed,
  getRepositories,
  getReviews,
  getStats,
  getTeam,
  notifyEscalation,
  updateDigestPreferences,
} from "./api";
import type { PullRow, RepoRow, ReviewItem } from "../types/api";

export function useAuthMe() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: getAuthMe,
    retry: false,
  });
}

export function useOrgStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
  });
}

export function usePullRequests(repoId?: string) {
  return useQuery({
    queryKey: ["reviews", "pulls", repoId ?? "all"],
    queryFn: async () => {
      const reviews = await getReviews();
      const scoped = repoId ? reviews.filter((r) => r.repo === repoId) : reviews;
      return scoped.map(mapReviewToPull);
    },
  });
}

export function usePullRequest(id: string) {
  return useQuery({
    queryKey: ["reviews", "item", id],
    queryFn: async () => {
      const reviews = await getReviews();
      return reviews.find((r) => r.id === id) ?? null;
    },
    enabled: id.length > 0,
  });
}

export function usePullRequestTrace(id: string) {
  return useQuery({
    queryKey: ["traces", id],
    queryFn: () => getAgentTracesForPullRequest(id),
    enabled: id.length > 0,
    refetchInterval: 1500,
  });
}

export function useDevelopers() {
  return useQuery({
    queryKey: ["developers"],
    queryFn: async () => {
      const [team, reviews] = await Promise.all([getTeam(), getReviews()]);
      return team.map((m) => mapDeveloper(m, reviews));
    },
  });
}

export function useDeveloper(login: string) {
  return useQuery({
    queryKey: ["developers", login],
    queryFn: async () => {
      const [team, reviews] = await Promise.all([getTeam(), getReviews()]);
      const member = team.find((m) => m.id === login || m.githubLogin === login);
      if (!member) return null;
      return mapDeveloper(member, reviews);
    },
    enabled: login.length > 0,
  });
}

export function useRepositories() {
  return useQuery({
    queryKey: ["repositories"],
    queryFn: async () => {
      const rows = await getRepositories();
      return rows.map((repo) => mapRepo(repo, repo.pullRequestCount));
    },
  });
}

export function useRepository(owner: string, repo: string) {
  return useQuery({
    queryKey: ["repository", owner, repo],
    queryFn: async (): Promise<(RepoRow & { owner: string; name: string }) | null> => {
      const rows = await getRepositories();
      const match = rows.find((r) => {
        const { owner: o, name: n } = splitFullName(r.fullName);
        return o === owner && n === repo;
      });
      if (!match) return null;
      const mapped = mapRepo(match, match.pullRequestCount);
      return { ...mapped, owner, name: repo };
    },
    enabled: owner.length > 0 && repo.length > 0,
  });
}

export function useReviewsRaw() {
  return useQuery({
    queryKey: ["reviews", "raw"],
    queryFn: getReviews,
  });
}

export function usePrVolume() {
  return useQuery({
    queryKey: ["volume"],
    queryFn: async () => {
      const reviews = await getReviews();
      return buildPrVolumeFromReviews(reviews);
    },
  });
}

export function useReviewLatency() {
  return useQuery({
    queryKey: ["latency"],
    queryFn: async () => {
      const stats = await getStats();
      return buildLatencyFromStats(stats);
    },
  });
}

export function useAntigravityRecentFeed() {
  return useQuery({
    queryKey: ["antigravity", "recent-traces"],
    queryFn: getRecentAntigravityTraceFeed,
    refetchInterval: 5000,
  });
}

export function useEscalations() {
  return useQuery({
    queryKey: ["escalations"],
    queryFn: getEscalations,
  });
}

export function useDigestPreferences() {
  return useQuery({
    queryKey: ["digest", "preferences"],
    queryFn: getDigestPreferences,
  });
}

export function useDigestPreview() {
  return useQuery({
    queryKey: ["digest", "preview"],
    queryFn: async () => {
      const [team, reviews] = await Promise.all([getTeam(), getReviews()]);
      return buildDigest(team, reviews);
    },
  });
}

export function useUpdateDigestPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateDigestPreferences,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["digest", "preferences"] });
    },
  });
}

export function useNotifyEscalation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (escalationId: string) => notifyEscalation(escalationId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["escalations"] });
    },
  });
}

export type { PullRow, ReviewItem };
