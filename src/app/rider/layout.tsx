import type { Metadata } from "next";

// Rider pages install as their own home-screen app ("Padaya Rider", opens at /rider).
export const metadata: Metadata = {
  manifest: "/rider/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Padaya Rider", statusBarStyle: "default" },
};

export default function RiderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
