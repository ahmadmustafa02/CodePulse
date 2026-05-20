import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserX } from "lucide-react-native";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { StatCard } from "../../../components/ui/StatCard";
import { SeverityStackBarMobile } from "../../../components/charts/CodePulseCharts";
import { useDeveloper } from "../../../lib/queries";

export default function DeveloperDetailScreen() {
  const { login } = useLocalSearchParams<{ login: string }>();
  const insets = useSafeAreaInsets();
  const q = useDeveloper(String(login));

  if (q.isLoading) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <LoadingSpinner />
      </View>
    );
  }

  if (q.isError) {
    return (
      <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top }}>
        <ErrorState error={q.error} />
      </View>
    );
  }

  if (!q.data) {
    return (
      <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top }}>
        <EmptyState icon={UserX} title="Developer not found" body="That profile doesn't exist in the team payload." />
      </View>
    );
  }

  const d = q.data;

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingTop: insets.top, padding: 16, paddingBottom: 40 }}>
      <Text className="text-xs uppercase tracking-widest text-zinc-500">Developer profile</Text>
      <Text className="mt-1 text-2xl font-semibold text-zinc-100" style={{ fontFamily: "Inter_600SemiBold" }}>
        @{d.handle}
      </Text>
      <Text className="mt-1 text-sm text-zinc-500">{d.role}</Text>

      <View className="mt-6 flex-row flex-wrap gap-3">
        <View className="min-w-[140px] flex-1">
          <StatCard label="Reviews this week" value={d.reviewsThisWeek} />
        </View>
        <View className="min-w-[140px] flex-1">
          <StatCard label="Resolve rate" value={`${d.resolveRate}%`} />
        </View>
      </View>

      <Card className="mt-6 p-4">
        <Text className="text-sm font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
          Findings by week
        </Text>
        <Text className="mt-1 text-xs text-zinc-500">Stacked by severity</Text>
        <SeverityStackBarMobile data={d.weekly} />
      </Card>

      <Card className="mt-6 p-4">
        <Text className="text-sm font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
          Skill radar (normalized)
        </Text>
        {d.radar.map((r: { axis: string; value: number }) => (
          <View key={r.axis} className="mt-3">
            <View className="flex-row justify-between">
              <Text className="text-xs text-zinc-400" numberOfLines={1} style={{ maxWidth: "70%" }}>
                {r.axis || "—"}
              </Text>
              <Text className="text-xs text-zinc-200">{r.value}%</Text>
            </View>
            <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-900">
              <View className="h-full rounded-full bg-emerald-500/80" style={{ width: `${r.value}%` }} />
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
