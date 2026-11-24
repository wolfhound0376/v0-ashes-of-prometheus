import type { MetadataRoute } from "next"

// The web-app manifest (served at /manifest.webmanifest): what makes the site installable as an app — its own icon on
// the Windows taskbar and desktop and the phone home screen, opening at the title without browser bars. Sam,
// 2026-11-23 ("PR6"); the install link is components/install-app.tsx, the rule lib/install-app.ts.
//
// The icon is the crowned lich from the title painting (public/images/intro-poster.webp), redrawn as a close-up so it
// reads at taskbar size (Sam: "Make icon art from the intro page but legible"). Files in public/icons/.
// No service worker: an installed app is still the live site, so there is never an old copy to update.

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/intro",
    name: "Ashes of Prometheus",
    short_name: "Ashes",
    description: "Out of the Abyss, run by Malachar — a live dark-fantasy table for D&D 5e.",
    start_url: "/intro",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0908",
    theme_color: "#0a0908",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
