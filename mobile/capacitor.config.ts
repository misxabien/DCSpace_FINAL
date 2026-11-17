import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dcspace.app",
  appName: "DC Space",
  webDir: "www",
  server: {
    // Load the same production UI used at dcspace-final.vercel.app
    url: "https://dcspace-final.vercel.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#448aff",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#448aff",
    },
  },
};

export default config;
