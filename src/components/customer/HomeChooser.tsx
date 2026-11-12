"use client";
import Link from "next/link";
import { StoreHeader } from "./Header";
import { Badge } from "@/components/ui";
import { useCart } from "@/lib/cart";
import { formatClock } from "@/lib/hours";
import { useLogo, useStoreSettings } from "@/lib/store-settings";

/** Home: choose between ordering from the café and (soon) renting a scooter. */
export function HomeChooser() {
  const { settings, open } = useStoreSettings();
  const { count } = useCart();
  const logo = useLogo();
  const cafeName = settings?.store_name?.trim() || "Pahuway Cafe";

  const cafeStatus = !settings
    ? null
    : open
      ? { tone: "text-sage-700", text: `Open now · until ${formatClock(settings.close_time)}` }
      : settings.is_open
        ? { tone: "text-coffee-700", text: `Closed now · opens ${formatClock(settings.open_time)}` }
        : { tone: "text-coffee-700", text: "Closed for now" };

  return (
    <div className="min-h-screen">
      <StoreHeader settings={settings} open={open} />
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">Welcome!</h1>
        <p className="mt-1 text-lg text-coffee-700">What would you like to do today?</p>

        <ul className="mt-6 grid gap-4" aria-label="Choose a service">
          <li>
            <Link
              href="/menu"
              data-testid="choose-cafe"
              className="card group flex items-center gap-4 p-4 transition hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-coffee-700 sm:p-5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-cream object-cover sm:h-24 sm:w-24" />
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-bold leading-snug">Order from {cafeName}</span>
                <span className="mt-0.5 block text-coffee-700">Coffee, drinks &amp; food · pickup, dine-in or delivery</span>
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
            <div
              role="link"
              aria-disabled="true"
              aria-label="Rent a scooter from Baybayin — coming soon"
              data-testid="choose-scooter"
              className="card flex cursor-not-allowed items-center gap-4 p-4 opacity-80 sm:p-5"
            >
              <span aria-hidden className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-4xl sm:h-24 sm:w-24">
                🛵
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl font-bold leading-snug">Rent a scooter from Baybayin</span>
                  <Badge tone="amber">Coming soon</Badge>
                </span>
                <span className="mt-0.5 block text-coffee-700">Scooter rentals for getting around San Agustin. Check back soon!</span>
              </span>
            </div>
          </li>
        </ul>
      </main>
    </div>
  );
}
