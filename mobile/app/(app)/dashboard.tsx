import { Link } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUpRight, GitPullRequest, Inbox } from "lucide-react-native";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { StatCard } from "../../components/ui/StatCard";
import { SeverityChip } from "../../components/ui/SeverityChip";
import { LatencyLineMobile, PRVolumeAreaMobile } from "../../components/charts/CodePulseCharts";
import {
  useAntigravityRecentFeed,
  usePrVolume,
  usePullRequests,
  useRepositories,
  useReviewLatency,
} from "../../lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import type { RecentAntigravityTraceFeedItem } from "../../types/api";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const reposQ = useRepositories();
  const pullsQ = usePullRequests();
  const volumeQ = usePrVolume();
  const latencyQ = useReviewLatency();
  const feedQ = useAntigravityRecentFeed();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["stats"] }),
        qc.invalidateQueries({ queryKey: ["repositories"] }),
        qc.invalidateQueries({ queryKey: ["reviews"] }),
        qc.invalidateQueries({ queryKey: ["antigravity", "recent-traces"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const totals = useMemo(() => {
    if (!pullsQ.data) return null;
    return {
      open: pullsQ.data.filter((p) => p.state !== "merged").length,
      critical: pullsQ.data.filter((p) => p.severity === "critical").length,
      merged: pullsQ.data.filter((p) => p.state === "merged").length,
      reviewed: reposQ.data?.reduce((s, r) => s + r.reviewed, 0) ?? 0,
    };
  }, [pullsQ.data, reposQ.data]);

  const loading = reposQ.isLoading || pullsQ.isLoading || volumeQ.isLoading || latencyQ.isLoading;
  const err = reposQ.error || pullsQ.error || volumeQ.error || latencyQ.error || feedQ.error;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1 px-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
      >
        <Text className="text-xs uppercase tracking-widest text-zinc-500" style={{ fontFamily: "Inter_500Medium" }}>
          This week
        </Text>
        <Text className="mt-1 text-2xl font-semibold text-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
          Pulse overview
        </Text>

        {loading ? (
          <LoadingSpinner />
        ) : err ? (
          <ErrorState error={err} />
        ) : !totals ? (
          <EmptyState title="No data" body="Pull to refresh." />
        ) : (
          <>
            <View className="mt-6 flex-row flex-wrap gap-3">
              <View className="w-[47%] min-w-[140px] flex-1">
                <StatCard label="Open PRs" value={totals.open} />
              </View>
              <View className="w-[47%] min-w-[140px] flex-1">
                <StatCard label="Critical findings" value={totals.critical} accentColor="#ef4444" />
              </View>
              <View className="w-[47%] min-w-[140px] flex-1">
                <StatCard label="Merged this week" value={totals.merged} />
              </View>
              <View className="w-[47%] min-w-[140px] flex-1">
                <StatCard label="PRs reviewed all-time" value={totals.reviewed.toLocaleString()} />
              </View>
            </View>

            <Card className="mt-8 p-4 ring-1 ring-orange-500/20">
              <View className="mb-3 flex-row items-center gap-2">
                <View className="size-2.5 rounded-full bg-orange-500" />
                <Text className="text-sm font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
                  Recent Autonomous Workspace
                </Text>
              </View>
              {feedQ.isLoading ? (
                <Text className="text-xs text-zinc-500">Loading feed…</Text>
              ) : feedQ.isError ? (
                <Text className="text-xs text-red-400">Could not load workspace feed.</Text>
              ) : !feedQ.data?.length ? (
                <Text className="text-xs text-zinc-500">No agent traces yet.</Text>
              ) : (
                feedQ.data.map((row: RecentAntigravityTraceFeedItem) => (
                  <FeedRow key={row.traceId} row={row} />
                ))
              )}
            </Card>

            <Card className="mt-6 p-4">
              <Text className="text-sm font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
                PR volume vs reviews
              </Text>
              <Text className="mt-1 text-xs text-zinc-500">Last 8 weeks</Text>
              {volumeQ.data ? <PRVolumeAreaMobile data={volumeQ.data} /> : null}
            </Card>

            <Card className="mt-6 p-4">
              <Text className="text-sm font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
                Avg review latency
              </Text>
              <Text className="mt-1 text-xs text-zinc-500">Seconds, synthetic curve from org stats</Text>
              {latencyQ.data ? <LatencyLineMobile data={latencyQ.data} /> : null}
            </Card>

            <Card className="mt-6 p-4">
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-sm font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
                  Recent reviews
                </Text>
                {reposQ.data?.[0] ? (
                  <Link
                    href={`/(app)/repositories/${reposQ.data[0].owner}/${reposQ.data[0].name}` as const}
                    asChild
                  >
                    <Pressable className="flex-row items-center gap-1">
                      <Text className="text-xs text-zinc-400" style={{ fontFamily: "Inter_400Regular" }}>
                        All repos
                      </Text>
                      <ArrowUpRight size={12} color="#a1a1aa" />
                    </Pressable>
                  </Link>
                ) : null}
              </View>
              {!pullsQ.data?.length ? (
                <EmptyState
                  icon={Inbox}
                  title="No PRs in flight"
                  body="When your team opens a pull request, CodePulse will review it automatically."
                />
              ) : (
                pullsQ.data.slice(0, 6).map((p) => (
                  <Link key={p.pullRequestId} href={`/(app)/pulls/${p.pullRequestId}`} asChild>
                    <Pressable className="flex-row gap-3 border-t border-zinc-800/60 py-3 first:border-t-0">
                      <GitPullRequest size={16} color="#71717a" style={{ marginTop: 2 }} />
                      <View className="min-w-0 flex-1">
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text
                            className="shrink text-sm font-medium text-zinc-100"
                            numberOfLines={2}
                            style={{ fontFamily: "Inter_500Medium" }}
                          >
                            {p.title}
                          </Text>
                          <SeverityChip severity={p.severity} />
                        </View>
                        <Text className="mt-1 text-xs text-zinc-500" numberOfLines={1} style={{ fontFamily: "Inter_400Regular" }}>
                          {p.repo} · #{p.id} · @{p.author}
                        </Text>
                      </View>
                    </Pressable>
                  </Link>
                ))
              )}
            </Card>

            <View className="h-24" />
          </>
        )}
      </ScrollView>
    </View>
  );
}

function FeedRow({ row }: { row: RecentAntigravityTraceFeedItem }) {
  const slash = row.repoFullName.indexOf("/");
  const owner = slash === -1 ? "" : row.repoFullName.slice(0, slash);
  const repo = slash === -1 ? row.repoFullName : row.repoFullName.slice(slash + 1);
  return (
    <Link href={`/(app)/repositories/${owner}/${repo}`} asChild>
      <Pressable className="mb-2 rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
        <Text className="text-[13px] leading-snug text-zinc-100" style={{ fontFamily: "Inter_400Regular" }}>
          {row.statusLine}
        </Text>
        <Text className="mt-0.5 text-[11px] text-zinc-500" numberOfLines={1} style={{ fontFamily: "Inter_400Regular" }}>
          {row.repoFullName} · {row.prTitle}
        </Text>
      </Pressable>
    </Link>
  );
}
