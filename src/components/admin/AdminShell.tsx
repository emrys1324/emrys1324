"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Toggle } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { enableAccountPush, isNativeApp, signOutAndGo } from "@/lib/native";
import { useLogo, useStoreSettings } from "@/lib/store-settings";
import { formatHours } from "@/lib/hours";
import { DEFAULT_STAFF_HEADER, headerTheme, headerVars, isHex } from "@/lib/color";
import { StaffRoleProvider, type StaffRole } from "./StaffRole";

const NAV: { href: string; label: string; staff?: boolean }[] = [
  { href: "/admin", label: "Orders", staff: true },
  { href: "/admin/stock", label: "Sold out", staff: true },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/options", label: "Options" },
  { href: "/admin/zones", label: "Zones" },
  { href: "/admin/summary", label: "Summary" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminShell({ email, role, children }: { email: string; role: StaffRole; children: React.ReactNode }) {
  const path = usePathname();
  const { settings, open } = useStoreSettings();
  const logo = useLogo();
  const staffTheme = headerTheme(isHex(settings?.staff_header_color) ? settings.staff_header_color : DEFAULT_STAFF_HEADER);
  const staffTitle = settings?.staff_title?.trim() || "Pahuway Staff";
  const [busy, setBusy] = useState(false);
  const [pushState, setPushState] = useState<string | null>(null);

  // In the Isla app: alert this device about new orders, even when the app is closed
  useEffect(() => {
    if (!isNativeApp()) return;
    enableAccountPush().then(setPushState);
  }, []);

  const toggleOpen = async (v: boolean) => {
    setBusy(true);
    await getSupabase().from("store_settings").update({ is_open: v }).eq("id", 1);
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <header
        data-testid="staff-header"
        className="sticky top-0 z-30 border-b border-black/10 bg-[color:var(--sbg)] pt-[env(safe-area-inset-top)] text-[color:var(--sfg)]"
        style={headerVars(staffTheme, "s")}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/admin" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" className="h-9 w-9 rounded-full bg-cream object-cover" />
            <span data-testid="staff-title" className="hidden font-display text-lg font-bold sm:inline">
              {staffTitle}
            </span>
          </Link>
          {settings && (
            <label className="flex items-center gap-3 rounded-2xl bg-coffee-900 px-3 py-1.5 text-cream">
              <span className="text-right leading-tight">
                <span className={`block text-sm font-bold ${open ? "text-sage-200" : "text-amber-200"}`}>
                  {settings.is_open ? (open ? "OPEN for orders" : "Outside hours") : "CLOSED"}
                </span>
                <span className="block text-xs text-coffee-200">{formatHours(settings)}</span>
              </span>
              {role === "admin" ? (
                <Toggle checked={settings.is_open} onChange={toggleOpen} disabled={busy} label="Store open for orders" />
              ) : null}
            </label>
          )}
          <button
            className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[color:var(--smuted)] hover:bg-[color:var(--shover)] md:block"
            onClick={() => signOutAndGo("/login")}
            title={email}
          >
            Sign out
          </button>
        </div>
        <nav className="no-scrollbar mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2" aria-label="Admin">
          {NAV.filter((n) => role === "admin" || n.staff).map((n) => {
            const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold ${active ? "bg-[color:var(--sactive-bg)] text-[color:var(--sactive-fg)]" : "text-[color:var(--smuted)] hover:bg-[color:var(--shover)]"}`}
              >
                {n.label}
              </Link>
            );
          })}
          <button
            className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-[color:var(--smuted)] hover:bg-[color:var(--shover)] md:hidden"
            onClick={() => signOutAndGo("/login")}
          >
            Sign out
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4">
        {pushState === "denied" && (
          <p className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            Notifications are off for Isla, so you won&apos;t be alerted to new orders while the app is closed. Turn them on in your phone&apos;s Settings → Apps → Isla → Notifications.
          </p>
        )}
        <StaffRoleProvider value={role}>{children}</StaffRoleProvider>
      </main>
    </div>
  );
}
