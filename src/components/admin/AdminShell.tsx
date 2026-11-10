"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Toggle } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { useStoreSettings } from "@/lib/store-settings";
import { formatHours } from "@/lib/hours";

const NAV = [
  { href: "/admin", label: "Orders" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/options", label: "Options" },
  { href: "/admin/zones", label: "Zones" },
  { href: "/admin/summary", label: "Summary" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const path = usePathname();
  const { settings, open } = useStoreSettings();
  const [busy, setBusy] = useState(false);

  const toggleOpen = async (v: boolean) => {
    setBusy(true);
    await getSupabase().from("store_settings").update({ is_open: v }).eq("id", 1);
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <header className="sticky top-0 z-30 border-b border-coffee-200 bg-coffee-800 text-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/admin" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-full bg-cream" />
            <span className="hidden font-display text-lg font-bold sm:inline">Pahuway Staff</span>
          </Link>
          {settings && (
            <label className="flex items-center gap-3 rounded-2xl bg-coffee-900/60 px-3 py-1.5">
              <span className="text-right leading-tight">
                <span className={`block text-sm font-bold ${open ? "text-sage-200" : "text-amber-200"}`}>
                  {settings.is_open ? (open ? "OPEN for orders" : "Outside hours") : "CLOSED"}
                </span>
                <span className="block text-xs text-coffee-200">{formatHours(settings)}</span>
              </span>
              <Toggle checked={settings.is_open} onChange={toggleOpen} disabled={busy} label="Store open for orders" />
            </label>
          )}
          <button
            className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-coffee-100 hover:bg-coffee-700 md:block"
            onClick={async () => {
              await getSupabase().auth.signOut();
              window.location.href = "/login";
            }}
            title={email}
          >
            Sign out
          </button>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2" aria-label="Admin">
          {NAV.map((n) => {
            const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${active ? "bg-cream text-coffee-900" : "text-coffee-100 hover:bg-coffee-700"}`}
              >
                {n.label}
              </Link>
            );
          })}
          <button
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-coffee-100 hover:bg-coffee-700 md:hidden"
            onClick={async () => {
              await getSupabase().auth.signOut();
              window.location.href = "/login";
            }}
          >
            Sign out
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4">{children}</main>
    </div>
  );
}
