import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CartProvider } from "@/lib/cart";
import { NativeBridge } from "@/components/NativeBridge";
import { BrandBackground } from "@/components/BrandBackground";
import { StoreSettingsProvider } from "@/lib/store-settings";

export const metadata: Metadata = {
  title: "Pahuway Cafe — Order online",
  description: "Specialty coffee in San Agustin, Romblon. Order for pickup, dine-in or delivery.",
  icons: { icon: "/logo.svg", apple: "/icons/icon-192.webp" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { title: "Isla", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#5a3a25",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NativeBridge />
        <StoreSettingsProvider>
          <BrandBackground />
          <CartProvider>{children}</CartProvider>
        </StoreSettingsProvider>
      </body>
    </html>
  );
}
