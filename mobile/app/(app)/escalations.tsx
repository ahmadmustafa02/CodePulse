import { useCallback, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertTriangle } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSpinner } from "../../components/ui/LoadingSpinner";
import { SeverityChip } from "../../components/ui/SeverityChip";
import { useEscalations, useNotifyEscalation } from "../../lib/queries";
import type { EscalationRecord } from "../../types/api";

export default function EscalationsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const q = useEscalations();
  const notify = useNotifyEscalation();
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ["escalations"] });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  const showToast = (msg: string) => {
    setToast(msg);
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setToast(null));
  };

  const sorted = (rows: EscalationRecord[]) =>
    [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="border-b border-zinc-800/60 px-4 py-3">
        <Text className="text-xl font-semibold text-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
          Escalations
        </Text>
        <Text className="mt-1 text-xs text-zinc-500">Critical findings escalated to team lead (simulated notify).</Text>
      </View>
      {q.isLoading ? (
        <LoadingSpinner />
      ) : q.isError ? (
        <View className="px-4">
          <ErrorState error={q.error} />
        </View>
      ) : (
        <FlatList
          data={sorted(q.data ?? [])}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fafafa" />}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
          ListEmptyComponent={
            <EmptyState
              icon={AlertTriangle}
              title="No escalations"
              body="When the API exposes escalation records, they will appear here."
            />
          }
          renderItem={({ item }) => (
            <EscalationCard
              item={item}
              onNotify={async () => {
                await notify.mutateAsync(item.id);
                showToast("Team lead notified via #eng-alerts");
              }}
              notifying={notify.isPending}
            />
          )}
        />
      )}
      {toast ? (
        <Animated.View
          className="absolute bottom-8 left-4 right-4 rounded-lg border border-emerald-500/30 bg-emerald-950/90 px-4 py-3"
          style={{ opacity: toastOpacity }}
        >
          <Text className="text-center text-sm text-emerald-100" style={{ fontFamily: "Inter_500Medium" }}>
            {toast}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function EscalationCard({
  item,
  onNotify,
  notifying,
}: {
  item: EscalationRecord;
  onNotify: () => Promise<void>;
  notifying: boolean;
}) {
  const [status, setStatus] = useState(item.status);
  const progress = useRef(new Animated.Value(status === "notified" ? 1 : 0)).current;

  const runTransition = () => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: false,
    }).start(() => setStatus("notified"));
  };

  const pillBg = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(39,39,42,0.9)", "rgba(6,78,59,0.55)"],
  });

  const pillBorder = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(113,113,122,0.6)", "rgba(16,185,129,0.55)"],
  });

  const pillText = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgb(212,212,216)", "rgb(167,243,208)"],
  });

  return (
    <Card className="mb-3 p-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <SeverityChip severity="critical" />
        <Animated.View
          className="rounded-full border px-2 py-0.5"
          style={{
            borderColor: pillBorder,
            backgroundColor: pillBg,
          }}
        >
          <Animated.Text
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{
              color: pillText,
            }}
          >
            {status}
          </Animated.Text>
        </Animated.View>
        <Text className="font-mono text-[10px] text-zinc-500">
          {item.file}:{item.line}
        </Text>
      </View>
      <View className="mt-2 self-start rounded-md border border-zinc-700 bg-zinc-900/50 px-2 py-1">
        <Text className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">{item.category}</Text>
      </View>
      <Text className="mt-2 text-sm text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
        {item.summary}
      </Text>
      <Text className="mt-2 text-[11px] text-zinc-500">
        {format(new Date(item.created_at), "MMM d, yyyy HH:mm")}
      </Text>
      {item.status === "pending" && status === "pending" ? (
        <Pressable
          disabled={notifying}
          onPress={async () => {
            try {
              await onNotify();
              runTransition();
            } catch {
              /* mutation surfaces via global error boundary / toast in production */
            }
          }}
          className="mt-4 items-center rounded-md bg-orange-500/20 py-2"
        >
          <Text className="text-xs font-semibold text-orange-200" style={{ fontFamily: "Inter_600SemiBold" }}>
            {notifying ? "Notifying…" : "Notify team lead"}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
