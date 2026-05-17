import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://vitejs.dev/config/server-options.html#server-hmr
// This makes HMR work while the app is embedded in Shopify
const isInstalledPackage =
  process.env.npm_lifecycle_event === "shopify" ||
  process.env.npm_lifecycle_event?.includes("shopify");

export default defineConfig({
  server: {
    allowedHosts: [
      "localhost",
      ".trycloudflare.com",
      ".ngrok.io",
      ".ngrok-free.app",
    ],
    port: Number(process.env.PORT || 3000),
    hmr: isInstalledPackage
      ? false
      : {
          protocol: "ws",
          host: "localhost",
          port: 64999,
        },
  },
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
});
