import { Text, View } from "react-native";
import { Card } from "./Card";
import { cn } from "../../lib/cn";

export function StatCard({
  label,
  value,
  accentColor,
  className,
}: {
  label: string;
  value: string | number;
  accentColor?: string;
  className?: string;
}) {
  return (
    <Card className={cn("p-4", className)}>
      <Text className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </Text>
      <Text
        className="mt-2 text-2xl font-medium text-foreground"
        style={accentColor ? { color: accentColor } : undefined}
      >
        {value}
      </Text>
    </Card>
  );
}
