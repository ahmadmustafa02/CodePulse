import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fafafa",
        headerTitleStyle: { fontFamily: "Inter_500Medium" },
        contentStyle: { backgroundColor: "#09090b" },
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: "Connect device" }} />
    </Stack>
  );
}
