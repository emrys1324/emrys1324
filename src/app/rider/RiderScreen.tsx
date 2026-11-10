"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/customer/Header";
import { Alert, Badge, PageLoader, Spinner } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { formatPeso, friendlyError, STATUS_LABEL } from "@/lib/format";
import { formatTime, storeNow } from "@/lib/hours";
import { playChime, unlockAudio } from "@/lib/sound";
import type { Order } from "@/lib/types";

export function RiderScreen() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const known = useRef<Set<string> | null>(null);

  // RLS returns only orders assigned to this rider.
  const load = useCallback(async () => {
    const { minutes, seconds } = storeNow();
    const startOfDay = new Date(Date.now() - (minutes * 60 + seconds) * 1000).toISOString();
    const { data, error } = await getSupabase()
      .from("orders")
      .select("*, order_items(*)")
      .or(`status.in.(received,preparing,ready,out_for_delivery),completed_at.gte.${startOfDay}`)
      .order("created_at");
    if (error) return setError(error.message);
    const list = data as Order[];
    // chime when a delivery we haven't seen before gets assigned to this rider
    const ids = new Set(list.map((o) => o.id));
    if (known.current && list.some((o) => !known.current!.has(o.id))) playChime();
    known.current = ids;
    setOrders(list);
  }, []);

  useEffect(() => {
    load();
    const supabase = getSupabase();
    const ch = supabase
      .channel("rider-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe((s) => s === "SUBSCRIBED" && load());
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    const poll = setInterval(load, 60_000);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
      supabase.removeChannel(ch);
    };
  }, [load]);

  const act = async (o: Order, action: "picked_up" | "delivered") => {
    if (action === "delivered" && o.payment_method === "cash" && !confirm(`Collected ${formatPeso(o.total)} from ${o.customer_name}?`)) return;
    setBusy(o.id + action);
    setError(null);
    const { error } = await getSupabase().rpc("rider_update_order", { p_order_id: o.id, p_action: action });
    setBusy(null);
    if (error) setError(friendlyError(error.message));
    load();
  };

  const active = (orders ?? []).filter((o) => !["completed", "cancelled"].includes(o.status));
  const done = (orders ?? []).filter((o) => o.status === "completed");
  const collected = done.filter((o) => o.payment_method === "cash").reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-20 border-b border-coffee-100 bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <Logo small />
          <button
            className="btn-ghost btn-sm"
            onClick={async () => {
              await getSupabase().auth.signOut();
              window.location.href = "/login";
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold">My deliveries</h1>
          {!soundOn && (
            <button className="btn-secondary btn-sm" onClick={async () => setSoundOn(await unlockAudio())}>
              🔕 Sound
            </button>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
        {!orders && <PageLoader />}
        {orders && active.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-4xl" aria-hidden>
              🛵
            </p>
            <p className="mt-2 font-semibold">No deliveries assigned right now.</p>
            <p className="text-coffee-600">New assignments appear here automatically.</p>
          </div>
        )}

        {active.map((o) => {
          const collect = o.payment_method === "cash" ? Number(o.total) : 0;
          const mapQuery = encodeURIComponent(`${o.street ?? ""} ${o.landmark ?? ""} ${o.zone_name ?? ""} San Agustin Romblon`);
          return (
            <article key={o.id} className="card overflow-hidden">
              <div className="flex items-center justify-between bg-coffee-800 px-4 py-3 text-cream">
                <span className="text-xl font-bold">{o.order_number}</span>
                <Badge tone={o.status === "out_for_delivery" ? "blue" : o.status === "ready" ? "green" : "amber"}>
                  {o.status === "ready" ? "Ready for pickup" : STATUS_LABEL[o.status]}
                </Badge>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{o.customer_name}</p>
                    <p className="font-mono text-coffee-700">{o.customer_phone}</p>
                  </div>
                  <a href={`tel:${o.customer_phone}`} className="btn-sage px-4" aria-label={`Call ${o.customer_name}`}>
                    📞 Call
                  </a>
                </div>
                <div className="rounded-2xl bg-cream p-3">
                  <p className="text-sm font-semibold text-coffee-600">{o.zone_name}</p>
                  <p className="text-lg font-semibold">{o.street}</p>
                  {o.landmark && <p>Landmark: {o.landmark}</p>}
                  {o.rider_notes && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm font-medium text-amber-900">Note: {o.rider_notes}</p>}
                  <a className="mt-1 inline-block text-sm font-semibold text-coffee-700 underline" href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">
                    Open in Maps
                  </a>
                </div>
                <div className="flex items-center justify-between rounded-2xl border-2 border-coffee-200 p-3">
                  <span className="font-semibold">{collect ? "Collect cash" : "Paid via GCash"}</span>
                  <span className={`text-2xl font-bold tabular-nums ${collect ? "" : "text-sage-700"}`}>{collect ? formatPeso(collect) : "₱0"}</span>
                </div>
                <p className="text-sm text-coffee-700">
                  {(o.order_items ?? []).reduce((s, i) => s + i.quantity, 0)} items · {o.scheduled_for ? `Deliver at ${formatTime(o.scheduled_for)}` : "ASAP"}
                </p>
                {o.status === "out_for_delivery" ? (
                  <button className="btn-sage w-full py-4 text-lg" disabled={!!busy} onClick={() => act(o, "delivered")}>
                    {busy === o.id + "delivered" ? <Spinner /> : "✓ Delivered"}
                  </button>
                ) : (
                  <button className="btn-primary w-full py-4 text-lg" disabled={!!busy || o.status === "received"} onClick={() => act(o, "picked_up")}>
                    {busy === o.id + "picked_up" ? <Spinner /> : o.status === "received" ? "Waiting for café to accept" : "Picked up"}
                  </button>
                )}
              </div>
            </article>
          );
        })}

        {done.length > 0 && (
          <section className="card p-4">
            <button className="flex w-full items-center justify-between font-bold" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
              <span>Delivered today ({done.length})</span>
              <span className="text-sm font-semibold text-coffee-700">Cash collected: {formatPeso(collected)}</span>
            </button>
            {showDone && (
              <ul className="mt-2 divide-y divide-coffee-100">
                {done.map((o) => (
                  <li key={o.id} className="flex justify-between py-2 text-sm">
                    <span>
                      {o.order_number} · {o.customer_name}
                    </span>
                    <span className="tabular-nums">
                      {o.payment_method === "cash" ? formatPeso(o.total) : "GCash"} · {o.completed_at && formatTime(o.completed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
