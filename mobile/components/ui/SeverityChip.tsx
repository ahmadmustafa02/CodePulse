import { Text, View } from "react-native";
import { cn } from "../../lib/cn";
import type { Severity } from "../../types/api";

const STYLES: Record<Severity, string> = {
  critical: "border-red-500/40 bg-red-500/12 text-red-200",
  high: "border-orange-500/40 bg-orange-500/12 text-orange-200",
  medium: "border-yellow-500/40 bg-yellow-500/12 text-yellow-200",
  low: "border-blue-500/40 bg-blue-500/12 text-blue-200",
};

export function SeverityChip({ severity }: { severity: Severity }) {
  return (
    <View className={cn("rounded-full border px-2 py-0.5", STYLES[severity])}>
      <Text className="text-[10px] font-semibold uppercase tracking-wider">{severity}</Text>
    </View>
  );
}
