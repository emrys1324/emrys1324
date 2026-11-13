import { NextResponse } from "next/server";
import { getSiteIcons } from "@/lib/site-icons";

/** Home-screen app for riders: "Padaya Rider", opens straight to their deliveries. */
export async function GET() {
  const icons = await getSiteIcons();
  const list = icons
    ? [
        { src: icons["192"]!, type: "image/png", sizes: "192x192", purpose: "any" },
        ...(icons["512"] ? [{ src: icons["512"], type: "image/png", sizes: "512x512", purpose: "any" }] : []),
      ]
    : [192, 512].map((n) => ({ src: `/icons/icon-${n}.webp`, type: "image/webp", sizes: `${n}x${n}`, purpose: "any" }));
  return NextResponse.json(
    {
      id: "/rider",
      name: "Padaya Rider",
      short_name: "Padaya Rider",
      description: "Deliveries for Pahuway Cafe riders",
      start_url: "/rider",
      scope: "/rider",
      display: "standalone",
      background_color: "#fbf7f0",
      theme_color: "#5a3a25",
      icons: list,
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
