import { useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { clearDeviceToken, getApiBaseUrl } from "../../lib/api";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const apiUrl = getApiBaseUrl();

  async function onDisconnect() {
    await clearDeviceToken();
    router.replace("/(auth)/sign-in");
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingTop: insets.top, padding: 16, paddingBottom: 40 }}>
      <Text className="text-xl font-semibold text-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
        Settings
      </Text>

      <View className="mt-6 rounded-xl border border-zinc-800 bg-card p-4">
        <Text className="text-xs uppercase tracking-widest text-zinc-500">API base URL</Text>
        <Text selectable className="mt-2 font-mono text-xs text-zinc-300">
          {apiUrl}
        </Text>
        <Text className="mt-2 text-xs text-zinc-500">
          From EXPO_PUBLIC_API_URL or app extra (Expo {Constants.expoConfig?.sdkVersion ?? "—"}).
        </Text>
      </View>

      <Pressable
        onPress={() => void Linking.openURL("https://getcodepulse.vercel.app/settings")}
        className="mt-4 rounded-xl border border-zinc-800 bg-card px-4 py-4"
      >
        <Text className="text-sm font-medium text-zinc-100">Open web settings</Text>
        <Text className="mt-1 text-xs text-zinc-500">Manage GitHub installation, repos, and (soon) device tokens.</Text>
      </Pressable>

      <Pressable onPress={onDisconnect} className="mt-8 items-center rounded-lg border border-red-500/40 py-3">
        <Text className="text-sm font-semibold text-red-300">Disconnect device</Text>
      </Pressable>
    </ScrollView>
  );
}
