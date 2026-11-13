import type { MetadataRoute } from "next";
import { getSiteIcons } from "@/lib/site-icons";

const BUNDLED = [48, 72, 96, 128, 192, 256, 512].map((n) => ({ src: `/icons/icon-${n}.webp`, type: "image/webp", sizes: `${n}x${n}`, purpose: "any" as const }));

/** Web-app manifest (home-screen install). Icons follow the website icon uploaded in Settings. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const icons = await getSiteIcons();
  return {
    id: "/",
    name: "Padaya — Pahuway Cafe & Baybayin Scooter Rental",
    short_name: "Padaya",
    description: "Order from Pahuway Cafe and book a Baybayin scooter in San Agustin, Romblon",
    start_url: "/",
    categories: ["food", "travel", "shopping"],
    scope: "/",
    display: "standalone",
    background_color: "#fbf7f0",
    theme_color: "#5a3a25",
    icons: icons
      ? [
          { src: icons["192"]!, type: "image/png", sizes: "192x192", purpose: "any" },
          ...(icons["512"] ? [{ src: icons["512"], type: "image/png", sizes: "512x512", purpose: "any" as const }] : []),
        ]
      : BUNDLED,
  };
}
