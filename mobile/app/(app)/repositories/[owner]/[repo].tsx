import { Link, useLocalSearchParams } from "expo-router";
import { useMemo, useState, useCallback } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GitPullRequest, Inbox } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { SeverityStackBarMobile } from "../../../../components/charts/CodePulseCharts";
import { Card } from "../../../../components/ui/Card";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ErrorState } from "../../../../components/ui/ErrorState";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { SeverityChip } from "../../../../components/ui/SeverityChip";
import { aggregateTopFiles, buildWeeklySeverityForRepo } from "../../../../lib/aggregates";
import { usePullRequests, useRepository, useReviewsRaw } from "../../../../lib/queries";
import type { PullRow } from "../../../../types/api";

export default function RepositoryDetailScreen() {
  const { owner, repo } = useLocalSearchParams<{ owner: string; repo: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const repoQ = useRepository(String(owner), String(repo));
  const pullsQ = usePullRequests(`${owner}/${repo}`);
  const reviewsQ = useReviewsRaw();
  const [refreshing, setRefreshing] = useState(false);

  const weekly = useMemo(
    () => (reviewsQ.data ? buildWeeklySeverityForRepo(reviewsQ.data, String(owner), String(repo)) : []),
    [reviewsQ.data, owner, repo],
  );

  const topFiles = useMemo(
    () => (reviewsQ.data ? aggregateTopFiles(reviewsQ.data, String(owner), String(repo)) : []),
    [reviewsQ.data, owner, repo],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["repository", owner, repo] }),
        qc.invalidateQueries({ queryKey: ["reviews"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc, owner, repo]);

  const loading = repoQ.isLoading || pullsQ.isLoading || reviewsQ.isLoading;

  if (loading) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <LoadingSpinner />
      </View>
    );
  }

  if (repoQ.isError || pullsQ.isError || reviewsQ.isError) {
    return (
      <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top }}>
        <ErrorState error={repoQ.error ?? pullsQ.error ?? reviewsQ.error} title="Could not load repository data." />
      </View>
    );
  }

  const r = repoQ.data;

  return (
    <ScrollView
      className="flex-1 bg-background"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 40 }}
    >
      <View className="px-4">
        <Text className="text-xs uppercase tracking-widest text-zinc-500">Repository</Text>
        <Text className="mt-1 text-2xl font-semibold text-zinc-100" style={{ fontFamily: "Inter_600SemiBold" }}>
          {owner}/{repo}
        </Text>

        {r ? (
          <Card className="mt-6 p-4">
            <Text className="text-sm font-medium text-zinc-100">Repository health</Text>
            <MetricRow label="Coverage" value={`${r.health}%`} pct={r.health} />
            <MetricRow label="Open PRs" value={String(r.openPRs)} pct={Math.min(100, (r.openPRs / 50) * 100)} />
            <MetricRow label="Lifetime reviewed" value={r.reviewed.toLocaleString()} pct={80} />
            <View className="mt-4 flex-row justify-between border-t border-zinc-800/60 pt-3">
              <Text className="text-xs text-zinc-500">Primary language</Text>
              <Text className="text-xs text-zinc-200">{r.language}</Text>
            </View>
          </Card>
        ) : null}

        <Card className="mt-6 p-4">
          <Text className="text-sm font-medium text-zinc-100">Severity over time</Text>
          <Text className="mt-1 text-xs text-zinc-500">All authors, last 8 weeks</Text>
          {weekly.length ? <SeverityStackBarMobile data={weekly} /> : null}
        </Card>

        <Text className="mb-2 mt-8 text-sm font-medium text-zinc-100">Pull requests</Text>
        {!pullsQ.data?.length ? (
          <EmptyState icon={Inbox} title="No pull requests yet" body="PRs for this repo will appear here." />
        ) : (
          pullsQ.data.map((p: PullRow) => (
            <Link key={p.pullRequestId} href={`/(app)/pulls/${p.pullRequestId}`} asChild>
              <Pressable className="mb-2 flex-row items-start gap-3 rounded-xl border border-zinc-800/80 bg-card p-4">
                <GitPullRequest size={16} color="#71717a" style={{ marginTop: 2 }} />
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="text-sm font-medium text-zinc-100" numberOfLines={2} style={{ fontFamily: "Inter_500Medium" }}>
                      {p.title}
                    </Text>
                    <SeverityChip severity={p.severity} />
                  </View>
                  <Text className="mt-1 text-xs text-zinc-500">
                    #{p.id} · @{p.author} · {p.files} files · {p.comments} findings
                  </Text>
                </View>
              </Pressable>
            </Link>
          ))
        )}

        <Text className="mb-2 mt-8 text-sm font-medium text-zinc-100">Top files by findings</Text>
        <Card className="p-0">
          {topFiles.length === 0 ? (
            <Text className="p-4 text-xs text-zinc-500">No findings for this repository yet.</Text>
          ) : (
            topFiles.map((f: { path: string; critical: number; high: number; medium: number }) => (
              <View key={f.path} className="border-t border-zinc-800/60 px-4 py-3 first:border-t-0">
                <Text className="font-mono text-xs text-zinc-200" numberOfLines={2}>
                  {f.path}
                </Text>
                <Text className="mt-1 text-[11px] text-zinc-500">
                  C:{f.critical} H:{f.high} M:{f.medium}
                </Text>
              </View>
            ))
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

function MetricRow({ label, value, pct }: { label: string; value: string; pct: number }) {
  return (
    <View className="mt-4">
      <View className="mb-1.5 flex-row justify-between">
        <Text className="text-xs text-zinc-500">{label}</Text>
        <Text className="text-xs text-zinc-200">{value}</Text>
      </View>
      <View className="h-1 w-full overflow-hidden rounded-full bg-zinc-900">
        <View className="h-full rounded-full bg-zinc-300" style={{ width: `${Math.min(100, pct)}%` }} />
      </View>
    </View>
  );
}
