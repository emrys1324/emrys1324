"use client";
import Link from "next/link";
import { formatClock } from "@/lib/hours";
import type { StoreSettings } from "@/lib/types";

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Pahuway Cafe home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" className={small ? "h-9 w-9" : "h-11 w-11"} />
      <span className="leading-tight">
        <span className={`block whitespace-nowrap font-display font-bold text-coffee-900 ${small ? "text-lg" : "text-xl"}`}>Pahuway Cafe</span>
        {!small && <span className="hidden whitespace-nowrap text-xs font-medium text-coffee-600 min-[400px]:block">San Agustin, Romblon</span>}
      </span>
    </Link>
  );
}

export function StoreHeader({ settings, open, back }: { settings: StoreSettings | null; open: boolean; back?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-coffee-100 bg-cream/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-1">
          {back && (
            <Link href={back} className="btn-ghost btn-sm -ml-2 h-10 w-10 !px-0 text-xl" aria-label="Back">
              ←
            </Link>
          )}
          <Logo small={!!back} />
        </div>
        <div className="flex items-center gap-2">
          {settings && (
            <span
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${open ? "bg-sage-100 text-sage-700" : "bg-stone-200 text-stone-800"}`}
            >
              {open ? (
                <>
                  Open<span className="hidden sm:inline"> · until {formatClock(settings.close_time)}</span>
                </>
              ) : (
                "Closed"
              )}
            </span>
          )}
          <Link href="/account" className="btn-ghost btn-sm h-10 w-10 !px-0" aria-label="My account">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
