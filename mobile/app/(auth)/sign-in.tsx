import { useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Card } from "../../components/ui/Card";
import { AntigravityPill } from "../../components/ui/AntigravityPill";
import { ApiError, setDeviceToken, testAuthMe } from "../../lib/api";

// TODO: REMOVE - auth gate in app/index.tsx temporarily bypasses this screen for visual testing.

export default function SignInScreen() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [testMessage, setTestMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onConnect() {
    const t = token.trim();
    if (!t) return;
    setBusy(true);
    try {
      await setDeviceToken(t);
      router.replace("/(app)/dashboard");
    } finally {
      setBusy(false);
    }
  }

  async function onTestConnection() {
    const t = token.trim();
    if (!t) {
      setTestStatus("err");
      setTestMessage("Paste a token first.");
      return;
    }
    setTestStatus("loading");
    setTestMessage("");
    try {
      await testAuthMe(t);
      setTestStatus("ok");
      setTestMessage("Token accepted.");
    } catch (e) {
      setTestStatus("err");
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Request failed";
      setTestMessage(msg);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <ScrollView contentContainerClassName="flex-grow px-4 py-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-semibold text-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
          CodePulse
        </Text>
        <Text className="mt-2 text-sm text-muted-foreground" style={{ fontFamily: "Inter_400Regular" }}>
          Connect this device with a token from the web app.
        </Text>

        <Card className="mt-8 p-5">
          <Text className="text-sm leading-relaxed text-zinc-200" style={{ fontFamily: "Inter_400Regular" }}>
            Sign in on web at{" "}
            <Text className="font-medium text-orange-300">https://getcodepulse.vercel.app</Text>, then open
            Settings → Device Tokens and copy a token.
          </Text>
          <Text className="mt-4 text-xs uppercase tracking-widest text-zinc-500">Device token</Text>
          <TextInput
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="cp_…"
            placeholderTextColor="#52525b"
            className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 font-mono text-sm text-foreground"
            style={{ fontFamily: "JetBrainsMono_400Regular" }}
          />
          <Pressable
            onPress={onConnect}
            disabled={busy || !token.trim()}
            className="mt-4 items-center rounded-lg bg-primary py-3 disabled:opacity-40"
          >
            <Text className="text-sm font-semibold text-primary-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
              {busy ? "Saving…" : "Connect"}
            </Text>
          </Pressable>
          <Pressable onPress={onTestConnection} className="mt-4">
            <Text className="text-center text-sm text-orange-400" style={{ fontFamily: "Inter_500Medium" }}>
              Test connection
            </Text>
          </Pressable>
          {testStatus !== "idle" ? (
            <Text
              className={`mt-3 text-center text-xs ${testStatus === "ok" ? "text-emerald-400" : "text-red-400"}`}
              style={{ fontFamily: "Inter_400Regular" }}
            >
              {testStatus === "loading" ? "Checking…" : testMessage}
            </Text>
          ) : null}
        </Card>

        <View className="mt-auto items-center pt-12">
          <AntigravityPill />
          <Text className="mt-2 text-[10px] text-zinc-600" style={{ fontFamily: "Inter_400Regular" }}>
            Antigravity-powered review traces on the go
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
