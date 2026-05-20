import { Link } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GitPullRequest } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { SeverityChip } from "../../components/ui/SeverityChip";
import { usePullRequests } from "../../lib/queries";
import type { PullRow } from "../../types/api";

export default function PullsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const q = usePullRequests();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ["reviews"] });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="border-b border-zinc-800/60 px-4 py-3">
        <Text className="text-xl font-semibold text-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
          Pull requests
        </Text>
        <Text className="mt-1 text-xs text-zinc-500" style={{ fontFamily: "Inter_400Regular" }}>
          Org-wide PR analysis feed
        </Text>
      </View>
      {q.isLoading ? (
        <LoadingSpinner />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(item) => item.pullRequestId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          ListEmptyComponent={
            <EmptyState
              icon={GitPullRequest}
              title="No PRs"
              body="Reviews will appear here when the GitHub app processes pull requests."
            />
          }
          renderItem={({ item }: { item: PullRow }) => (
            <Link href={`/(app)/pulls/${item.pullRequestId}`} asChild>
              <Pressable className="mb-3 rounded-xl border border-zinc-800/80 bg-card p-4 active:bg-zinc-900/50">
                <View className="flex-row flex-wrap items-center gap-2">
                  <GitPullRequest size={16} color="#71717a" />
                  <Text
                    className="flex-1 text-sm font-medium text-zinc-100"
                    numberOfLines={2}
                    style={{ fontFamily: "Inter_500Medium" }}
                  >
                    {item.title}
                  </Text>
                  <SeverityChip severity={item.severity} />
                </View>
                <Text className="mt-2 text-xs text-zinc-500" style={{ fontFamily: "Inter_400Regular" }}>
                  {item.repo} · #{item.id} · @{item.author}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}
