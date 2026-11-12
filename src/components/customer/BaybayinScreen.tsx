"use client";
import Link from "next/link";
import { StoreHeader } from "./Header";
import { Badge } from "@/components/ui";
import { useStoreSettings } from "@/lib/store-settings";
import { brandOf, welcomeTexts } from "@/lib/brands";

/** Baybayin scooter rental — a "coming soon" page with Baybayin's own header (rental pages come later). */
export function BaybayinScreen() {
  const { settings, open } = useStoreSettings();
  const bay = brandOf(settings, "baybayin");
  const cafe = brandOf(settings, "cafe");
  const t = welcomeTexts(settings);
  return (
    <div className="min-h-screen">
      <StoreHeader settings={settings} open={open} brand="baybayin" back="/" />
      <main className="mx-auto max-w-lg px-4 py-10 text-center">
        {bay.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bay.logo} alt={`${bay.name} logo`} className="mx-auto h-32 w-32 rounded-3xl bg-white object-contain p-2 shadow-card" />
        ) : (
          <span aria-hidden className="mx-auto flex h-32 w-32 items-center justify-center rounded-3xl bg-sky-100 text-6xl">
            {bay.emoji}
          </span>
        )}
        <h1 className="mt-6 font-display text-3xl font-bold leading-tight">{bay.name}</h1>
        {bay.tagline && <p className="mt-1 text-coffee-700">{bay.tagline}</p>}
        <p className="mt-4">
          <Badge tone="amber">Coming soon</Badge>
        </p>
        {t.baybayinCard && <p className="mt-4 text-lg text-coffee-800">{t.baybayinCard}</p>}
        <div className="mt-8 grid gap-3">
          <Link href="/menu" className="btn-primary w-full">
            Order from {cafe.name} meanwhile
          </Link>
          <Link href="/" className="btn-secondary w-full">
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
