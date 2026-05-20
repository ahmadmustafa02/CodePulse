import type { ExpoConfig } from "expo/config";

const defaultApi =
  process.env.EXPO_PUBLIC_API_URL ?? "https://thecodepulse.azurewebsites.net/api/v1";

const config: ExpoConfig = {
  name: "CodePulse",
  slug: "codepulse",
  version: "1.0.0",
  orientation: "portrait",
  scheme: "codepulse",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#09090b",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.codepulse.app",
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#09090b",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: "com.codepulse.app",
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-router", "expo-secure-store"],
  extra: {
    apiUrl: defaultApi,
  },
};

export default config;
