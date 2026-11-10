import type { CapacitorConfig } from "@capacitor/cli";

// The Isla app is a native shell around the live site, so menu/price changes and
// most fixes reach the app instantly without a store update. A bundled offline
// page (mobile/www/offline.html) is shown when there's no connection.
const SERVER_URL = process.env.ISLA_SERVER_URL || "https://pahuway-cafe.vercel.app";

const config: CapacitorConfig = {
  appId: "cafe.pahuway.isla",
  appName: "Isla",
  webDir: "mobile/www",
  server: {
    url: SERVER_URL,
    errorPath: "offline.html",
    allowNavigation: [new URL(SERVER_URL).host],
  },
  backgroundColor: "#fbf7f0",
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
    scheme: "Isla",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#fbf7f0",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
