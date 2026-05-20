import { Link } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Users } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { useDevelopers } from "../../lib/queries";
import type { DeveloperRow } from "../../types/api";

export default function DevelopersScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const q = useDevelopers();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ["developers"] });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="border-b border-zinc-800/60 px-4 py-3">
        <Text className="text-xl font-semibold text-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
          Developers
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
          ListEmptyComponent={<EmptyState icon={Users} title="No team" body="Install the GitHub app to index developers." />}
          renderItem={({ item }: { item: DeveloperRow }) => (
            <Link href={`/(app)/developers/${item.handle}`} asChild>
              <Pressable className="mb-3 rounded-xl border border-zinc-800/80 bg-card p-4">
                <Text className="text-base font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
                  @{item.handle}
                </Text>
                <Text className="mt-1 text-xs text-zinc-500" style={{ fontFamily: "Inter_400Regular" }}>
                  {item.role} · {item.reviewsThisWeek} reviews this week · {item.resolveRate}% resolve
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}
