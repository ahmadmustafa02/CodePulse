import { Text, View } from "react-native";
import { cn } from "../../lib/cn";

export function AntigravityPill({ className }: { className?: string }) {
  return (
    <View
      className={cn(
        "inline-flex shrink-0 flex-row items-center rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5",
        className,
      )}
    >
      <Text className="text-[10px] font-medium leading-none tracking-wide text-amber-200/95">
        ⚡ Antigravity
      </Text>
    </View>
  );
}
