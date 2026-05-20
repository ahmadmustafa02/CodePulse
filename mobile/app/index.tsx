import { Redirect } from "expo-router";

export default function Index() {
  // TODO: REMOVE - temporary auth bypass for visual testing
  return <Redirect href="/(app)/dashboard" />;
}
