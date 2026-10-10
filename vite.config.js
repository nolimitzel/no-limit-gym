import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// NO LIMIT — Vite config. Preserves the installable, offline PWA behaviour the
// app had before (service worker is now generated, not hand-written), and never
// caches Supabase API/auth traffic.
export default defineConfig({
  server: { port: 4173 },
  preview: { port: 4173 },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "No Limit — Gym Tracker",
        short_name: "No Limit",
        description: "Your personal 5-day muscle-building tracker.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0A0B0A",
        theme_color: "#0A0B0A",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        // Supabase requests must always hit the network — never serve stale auth/data.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co"),
            handler: "NetworkOnly"
          }
        ]
      }
    })
  ]
});
