import { View, type ViewProps } from "react-native";
import { cn } from "../../lib/cn";

export function Card({ className, children, ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("rounded-xl bg-card ring-1 ring-white/5", className)}
      {...rest}
    >
      {children}
    </View>
  );
}
