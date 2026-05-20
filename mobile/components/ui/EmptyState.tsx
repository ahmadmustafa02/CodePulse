import type { LucideIcon } from "lucide-react-native";
import { Text, View } from "react-native";
import { Card } from "./Card";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="items-center p-8">
      {Icon ? <Icon size={32} color="#71717a" /> : null}
      <Text className="mt-4 text-center text-base font-medium text-foreground">{title}</Text>
      <Text className="mt-2 text-center text-sm text-muted-foreground">{body}</Text>
      {action ? <View className="mt-6">{action}</View> : null}
    </Card>
  );
}
