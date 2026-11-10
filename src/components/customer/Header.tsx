"use client";
import Link from "next/link";
import { formatClock } from "@/lib/hours";
import type { StoreSettings } from "@/lib/types";
import { useLogo, useStoreSettings } from "@/lib/store-settings";
import { headerTheme, headerVars, isHex } from "@/lib/color";

export function Logo({ small = false }: { small?: boolean }) {
  const logo = useLogo();
  const { settings } = useStoreSettings();
  const name = settings?.store_name?.trim() || "Pahuway Cafe";
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label={`${name} home`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo} alt="" className={`${small ? "h-9 w-9" : "h-11 w-11"} shrink-0 rounded-full object-cover`} />
      <span className="min-w-0 leading-tight">
        {/* Long names wrap onto up to two lines on phones instead of being cut off */}
        <span
          data-testid="store-title"
          className={`line-clamp-2 break-words font-display font-bold leading-tight text-[color:var(--hfg,#2e1e14)] ${
            small ? "text-base sm:text-lg" : "text-base min-[400px]:text-lg sm:text-xl"
          }`}
        >
          {name}
        </span>
        {!small && <span className="hidden whitespace-nowrap text-xs font-medium text-[color:var(--hmuted,#714a2f)] sm:block">San Agustin, Romblon</span>}
      </span>
    </Link>
  );
}

/** Props for a customer-facing header: admin colour (with readable text) or the default cream. */
export function useCustomerHeaderStyle(): { className: string; style?: React.CSSProperties } {
  const { settings } = useStoreSettings();
  if (!isHex(settings?.header_color)) return { className: "border-coffee-100 bg-cream/95 backdrop-blur" };
  const t = headerTheme(settings.header_color);
  return { className: "border-black/10 bg-[color:var(--hbg)]", style: headerVars(t, "h") };
}

export function StoreHeader({ settings, open, back }: { settings: StoreSettings | null; open: boolean; back?: string }) {
  const hs = useCustomerHeaderStyle();
  return (
    <header data-testid="customer-header" className={`sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] ${hs.className}`} style={hs.style}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {back && (
            <Link href={back} className="btn-ghost btn-sm -ml-2 h-10 w-10 !px-0 text-xl !text-[color:var(--hfg,#5a3a25)] hover:!bg-[color:var(--hhover,#efe4d8)]" aria-label="Back">
              ←
            </Link>
          )}
          <Logo small={!!back} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          <Link href="/account" className="btn-ghost btn-sm h-10 w-10 !px-0 !text-[color:var(--hfg,#5a3a25)] hover:!bg-[color:var(--hhover,#efe4d8)]" aria-label="My account">
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
