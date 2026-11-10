"use client";
import { useEffect, useState } from "react";
import { Alert, PageLoader } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { formatPeso, ORDER_TYPE_LABEL } from "@/lib/format";
import type { OrderType } from "@/lib/types";

interface Summary {
  date: string;
  orders: number;
  completed: number;
  cancelled: number;
  open: number;
  sales: number;
  delivery_fees: number;
  average: number;
  top_items: { name: string; qty: number; sales: number }[];
  by_type: { order_type: OrderType; orders: number; sales: number }[];
  by_payment: { payment_method: "cash" | "gcash" | "online"; orders: number; sales: number }[];
}

function todayInManila() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export function SummaryAdmin() {
  const [date, setDate] = useState(todayInManila());
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    getSupabase()
      .rpc("daily_summary", { p_date: date })
      .then(({ data, error }) => (error ? setError(error.message) : setData(data as Summary)));
  }, [date]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Daily summary</h1>
        <label className="flex items-center gap-2">
          <span className="text-sm font-semibold">Date</span>
          <input type="date" className="input w-auto" value={date} max={todayInManila()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </div>
      {error && <Alert>{error}</Alert>}
      {!data && !error && <PageLoader />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total sales" value={formatPeso(data.sales)} hint={`incl. ${formatPeso(data.delivery_fees)} delivery fees`} big />
            <Stat label="Orders" value={String(data.orders)} hint={`${data.completed} completed · ${data.open} open`} />
            <Stat label="Average order" value={formatPeso(data.average)} />
            <Stat label="Cancelled" value={String(data.cancelled)} hint="not counted in sales" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="card p-5">
              <h2 className="section-title">Top 5 items</h2>
              <p className="mb-3 text-sm text-coffee-600">By quantity sold</p>
              <BarList rows={data.top_items.map((t) => ({ label: t.name, value: t.qty, display: `${t.qty} sold`, sub: formatPeso(t.sales) }))} empty="No sales yet." />
            </section>
            <section className="card p-5">
              <h2 className="section-title">Sales by order type</h2>
              <p className="mb-3 text-sm text-coffee-600">Excludes cancelled orders</p>
              <BarList
                rows={data.by_type.map((t) => ({ label: ORDER_TYPE_LABEL[t.order_type], value: Number(t.sales), display: formatPeso(t.sales), sub: `${t.orders} order${t.orders === 1 ? "" : "s"}` }))}
                empty="No sales yet."
              />
              {data.by_payment.length > 0 && (
                <div className="mt-4 border-t border-coffee-100 pt-3 text-sm">
                  {data.by_payment.map((p) => (
                    <p key={p.payment_method} className="flex justify-between">
                      <span>{p.payment_method === "gcash" ? "GCash (manual)" : p.payment_method === "online" ? "Online (HitPay)" : "Cash"} ({p.orders})</span>
                      <span className="font-semibold tabular-nums">{formatPeso(p.sales)}</span>
                    </p>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint, big }: { label: string; value: string; hint?: string; big?: boolean }) {
  return (
    <div className={`card p-4 ${big ? "bg-coffee-800 text-cream" : ""}`}>
      <p className={`text-sm font-semibold ${big ? "text-coffee-100" : "text-coffee-600"}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{value}</p>
      {hint && <p className={`mt-0.5 text-xs ${big ? "text-coffee-200" : "text-coffee-600"}`}>{hint}</p>}
    </div>
  );
}

/** Ranked horizontal bars: one hue, value labelled on every row, so it doubles as a table. */
function BarList({ rows, empty }: { rows: { label: string; value: number; display: string; sub?: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-coffee-600">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.display}${r.sub ? ` · ${r.sub}` : ""}`}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-semibold">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-bold">{r.display}</span>
              {r.sub && <span className="text-coffee-600"> · {r.sub}</span>}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-coffee-50">
            <div className="h-full rounded-full bg-coffee-500" style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
