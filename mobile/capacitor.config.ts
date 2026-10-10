import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The FloorTest app: a native shell that runs floortest.app, with native pieces added over time (background audio,
 * lock-screen controls, push, share-to-FloorTest). It holds no database or storage keys (see docs/05-data.md).
 * FLOORTEST_URL picks the site at sync time: your local copy while prototyping, floortest.app for real builds.
 */
const site = (process.env.FLOORTEST_URL ?? "https://floortest.app").replace(/\/$/, "");
// The app opens on the desk (signed-out people are sent to log in), never the marketing home page.
const url = `${site}/dashboard/floor`;

const config: CapacitorConfig = {
  appId: "app.floortest",
  appName: "FloorTest",
  webDir: "www",
  backgroundColor: "#10110f",
  server: {
    url,
    cleartext: url.startsWith("http://"),
    // No connection: show our own offline screen (www/index.html) instead of a browser error.
    errorPath: "index.html",
    // Only FloorTest's own pages open inside the app; anything else opens in the browser.
    allowNavigation: ["floortest.app", "*.floortest.app", "localhost"],
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#10110f",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: "#10110f", showSpinner: false },
    // Android: light clock and icons on the dark bars, whatever the phone's light/dark setting.
    SystemBars: { style: "DARK" },
    // The status bar keeps its own strip, so the page never slides under the clock or the notch.
    StatusBar: { style: "DARK", backgroundColor: "#10110f", overlaysWebView: false },
  },
};

export default config;
