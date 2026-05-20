import { Link } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FolderGit2 } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { useRepositories } from "../../lib/queries";
import type { RepoRow } from "../../types/api";

export default function RepositoriesScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const q = useRepositories();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ["repositories"] });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="border-b border-zinc-800/60 px-4 py-3">
        <Text className="text-xl font-semibold text-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
          Repositories
        </Text>
      </View>
      {q.isLoading ? (
        <LoadingSpinner />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          ListEmptyComponent={<EmptyState icon={FolderGit2} title="No repositories" body="Select repos in the GitHub app installation." />}
          renderItem={({ item }: { item: RepoRow }) => (
            <Link href={`/(app)/repositories/${item.owner}/${item.name}`} asChild>
              <Pressable className="mb-3 flex-row items-center justify-between rounded-xl border border-zinc-800/80 bg-card p-4">
                <View>
                  <Text className="text-sm font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
                    {item.owner}/{item.name}
                  </Text>
                  <Text className="mt-1 text-xs text-zinc-500">
                    {item.language} · {item.openPRs} open
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-medium text-zinc-200">{item.health}%</Text>
                  <Text className="text-[10px] uppercase tracking-widest text-zinc-600">health</Text>
                </View>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}
