import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "../../components/ui/Card";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { SeverityChip } from "../../components/ui/SeverityChip";
import { useDigestPreferences, useDigestPreview, useUpdateDigestPreferences } from "../../lib/queries";
import { normalizeSeverity } from "../../lib/severity";

export default function DigestScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const previewQ = useDigestPreview();
  const prefQ = useDigestPreferences();
  const updatePref = useUpdateDigestPreferences();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["digest", "preview"] }),
        qc.invalidateQueries({ queryKey: ["digest", "preferences"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const enabled = prefQ.data?.digestEmailEnabled ?? false;
  const hasEmail = prefQ.data?.hasEmail ?? false;

  if (previewQ.isLoading || prefQ.isLoading) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <LoadingSpinner />
      </View>
    );
  }

  if (previewQ.isError || prefQ.isError) {
    return (
      <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top }}>
        <ErrorState error={previewQ.error ?? prefQ.error} />
      </View>
    );
  }

  const d = previewQ.data!;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ paddingTop: insets.top, padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
    >
      <Text className="text-xl font-semibold text-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
        Weekly digest
      </Text>
      <Text className="mt-2 text-sm text-zinc-500">{d.range}</Text>

      <Card className="mt-6 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-4">
            <Text className="text-sm font-medium text-zinc-100">Email digest</Text>
            <Text className="mt-1 text-xs text-zinc-500">
              {hasEmail ? "Uses the email on your CodePulse account." : "Add an email on web to enable sends."}
            </Text>
          </View>
          <Switch
            value={enabled}
            disabled={updatePref.isPending}
            onValueChange={(v) => updatePref.mutate(v)}
          />
        </View>
      </Card>

      <Card className="mt-6 p-4">
        <Text className="text-sm font-medium text-zinc-100">@{d.developer.handle}</Text>
        <Text className="mt-3 text-sm leading-relaxed text-zinc-300">{d.summary}</Text>
      </Card>

      <Text className="mb-2 mt-8 text-sm font-medium text-zinc-100">Improvement themes</Text>
      {d.improvements.map((im) => (
        <Card key={im.label} className="mb-2 p-3">
          <Text className="text-xs text-zinc-400">{im.label}</Text>
          <Text className="mt-1 text-sm text-zinc-200">{im.delta}% target shift</Text>
        </Card>
      ))}

      <Text className="mb-2 mt-8 text-sm font-medium text-zinc-100">Top mistakes</Text>
      {d.topMistakes.map((m) => (
        <Card key={m.title} className="mb-2 p-3">
          <View className="flex-row items-center gap-2">
            <SeverityChip severity={normalizeSeverity(m.severity)} />
            <Text className="text-sm font-medium text-zinc-100">{m.title}</Text>
          </View>
          <Text className="mt-2 text-xs text-zinc-500">{m.body}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
