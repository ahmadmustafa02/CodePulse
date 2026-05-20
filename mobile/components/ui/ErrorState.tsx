import { Text, View } from "react-native";
import { Card } from "./Card";

export function formatQueryError(error?: unknown, fallback = "Request failed"): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error;
  if (error != null && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return String((error as { message: string }).message);
  }
  return fallback;
}

export function ErrorState({
  message,
  error,
  title = "Could not load",
}: {
  message?: string;
  error?: unknown;
  title?: string;
}) {
  const text = message?.trim() ? message : formatQueryError(error);
  return (
    <Card className="p-4">
      <Text className="text-sm font-medium text-foreground">{title}</Text>
      <Text className="mt-2 text-sm text-red-400">{text}</Text>
    </Card>
  );
}
