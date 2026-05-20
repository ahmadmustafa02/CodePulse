import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRight, FolderGit2, Mail, Settings } from "lucide-react-native";

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="border-b border-zinc-800/60 px-4 py-3">
        <Text className="text-xl font-semibold text-foreground" style={{ fontFamily: "Inter_600SemiBold" }}>
          More
        </Text>
      </View>
      <View className="px-4 pt-4">
        <Row href="/(app)/repositories" icon={FolderGit2} label="Repositories" />
        <Row href="/(app)/digest" icon={Mail} label="Weekly digest" />
        <Row href="/(app)/settings" icon={Settings} label="Settings" />
      </View>
    </View>
  );
}

function Row({ href, icon: Icon, label }: { href: "/(app)/repositories" | "/(app)/digest" | "/(app)/settings"; icon: typeof Settings; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable className="mb-2 flex-row items-center justify-between rounded-xl border border-zinc-800/80 bg-card px-4 py-4">
        <View className="flex-row items-center gap-3">
          <Icon size={20} color="#a1a1aa" />
          <Text className="text-sm font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
            {label}
          </Text>
        </View>
        <ChevronRight size={18} color="#52525b" />
      </Pressable>
    </Link>
  );
}
