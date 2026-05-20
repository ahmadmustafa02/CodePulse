import { Tabs } from "expo-router";
import {
  AlertTriangle,
  GitPullRequest,
  LayoutDashboard,
  Menu,
  Users,
} from "lucide-react-native";

export default function AppTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: "#09090b" },
        headerTintColor: "#fafafa",
        headerTitleStyle: { fontFamily: "Inter_500Medium", fontSize: 16 },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: "#09090b",
          borderTopColor: "rgba(255,255,255,0.08)",
        },
        tabBarActiveTintColor: "#fafafa",
        tabBarInactiveTintColor: "#71717a",
        tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="pulls"
        options={{
          title: "PRs",
          tabBarIcon: ({ color, size }) => <GitPullRequest color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="developers"
        options={{
          title: "Developers",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="escalations"
        options={{
          title: "Escalations",
          tabBarIcon: ({ color, size }) => <AlertTriangle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size }) => <Menu color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="pulls/[id]" options={{ href: null, title: "Pull request" }} />
      <Tabs.Screen name="developers/[login]" options={{ href: null, title: "Developer" }} />
      <Tabs.Screen name="repositories" options={{ href: null, title: "Repositories" }} />
      <Tabs.Screen name="repositories/[owner]/[repo]" options={{ href: null, title: "Repository" }} />
      <Tabs.Screen name="digest" options={{ href: null, title: "Digest" }} />
      <Tabs.Screen name="settings" options={{ href: null, title: "Settings" }} />
    </Tabs>
  );
}
