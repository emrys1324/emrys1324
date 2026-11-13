"use client";
import Link from "next/link";
import { StoreHeader } from "./Header";
import { InstallPrompt } from "@/components/InstallPrompt";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { Badge } from "@/components/ui";
import { useCart } from "@/lib/cart";
import { formatClock } from "@/lib/hours";
import { useStoreSettings } from "@/lib/store-settings";
import { brandOf, welcomeTexts } from "@/lib/brands";
import { bookingsOpen, useRentalSettings } from "@/lib/rentals";

/** Home: choose between ordering from the café and renting a scooter. */
export function HomeChooser() {
  const { settings, open } = useStoreSettings();
  const { count } = useCart();
  const cafe = brandOf(settings, "cafe");
  const bay = brandOf(settings, "baybayin");
  const t = welcomeTexts(settings);
  const rs = useRentalSettings();
  const firstName = useFirstName();

  const cafeStatus = !settings
    ? null
    : open
      ? { tone: "text-sage-700", text: `Open now · until ${formatClock(settings.close_time)}` }
      : settings.is_open
        ? { tone: "text-coffee-700", text: `Closed now · opens ${formatClock(settings.open_time)}` }
        : { tone: "text-coffee-700", text: "Closed for now" };

  return (
    <div className="min-h-screen">
      <StoreHeader settings={settings} open={open} brand="site" />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <h1 data-testid="welcome-title" className="font-display text-3xl font-bold leading-tight sm:text-4xl">
          {firstName ? `Welcome, ${firstName}!` : t.title}
        </h1>
        {t.subtitle && (
          <p data-testid="welcome-subtitle" className="mt-1 text-lg text-coffee-700">
            {t.subtitle}
          </p>
        )}

        <ul className="mt-6 grid gap-4" aria-label="Choose a service">
          <li>
            <Link
              href="/menu"
              data-testid="choose-cafe"
              className="card group flex items-center gap-4 p-4 transition hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-coffee-700 sm:p-5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cafe.logo ?? undefined} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-cream object-cover sm:h-24 sm:w-24" />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-bold leading-snug">Order from {cafe.name}</span>
                {t.cafeCard && <span className="mt-0.5 block text-coffee-700">{t.cafeCard}</span>}
                {cafeStatus && <span className={`mt-1 block text-sm font-semibold ${cafeStatus.tone}`}>{cafeStatus.text}</span>}
                {count > 0 && (
                  <span className="mt-1 block text-sm font-semibold text-coffee-800">
                    Continue your order · {count} item{count === 1 ? "" : "s"} in cart
                  </span>
                )}
              </span>
              <span aria-hidden className="text-2xl text-coffee-500 transition group-hover:translate-x-1">
                →
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/baybayin"
              data-testid="choose-scooter"
              className="card group flex items-center gap-4 p-4 transition hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-coffee-700 sm:p-5"
            >
              {bay.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bay.logo} alt="" data-testid="baybayin-logo" className="h-20 w-20 shrink-0 rounded-2xl bg-white object-contain p-1 sm:h-24 sm:w-24" />
              ) : (
                <span aria-hidden className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-4xl sm:h-24 sm:w-24">
                  {bay.emoji}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl font-bold leading-snug">Rent a scooter from {bay.name}</span>
                  {rs && (bookingsOpen(rs) ? <Badge tone="green">Book now</Badge> : <Badge tone="amber">Coming soon</Badge>)}
                </span>
                {t.baybayinCard && <span className="mt-0.5 block text-coffee-700">{t.baybayinCard}</span>}
              </span>
              <span aria-hidden className="text-2xl text-coffee-500 transition group-hover:translate-x-1">
                →
              </span>
            </Link>
          </li>
        </ul>
        <div className="mt-5">
          <InstallPrompt />
        </div>
      </main>
    </div>
  );
}

/** First name of the signed-in person (from their profile, else sign-up details); null when signed out. */
function useFirstName(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const db = getSupabase();
    let active = true;
    const load = async (uid: string | null, meta?: Record<string, unknown>) => {
      if (!uid) return active && setName(null);
      const { data } = await db.from("users").select("full_name").eq("id", uid).maybeSingle();
      const full = ((data?.full_name as string | null) || (meta?.full_name as string | undefined) || "").trim();
      if (active) setName(full ? full.split(/\s+/)[0] : null);
    };
    db.auth.getUser().then(({ data }) => load(data.user?.id ?? null, data.user?.user_metadata));
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => load(session?.user?.id ?? null, session?.user?.user_metadata));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return name;
}
