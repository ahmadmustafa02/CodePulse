import { ActivityIndicator, View } from "react-native";

export function LoadingSpinner({ label }: { label?: string }) {
  return (
    <View className="items-center justify-center py-12">
      <ActivityIndicator size="large" color="#fafafa" />
    </View>
  );
}
