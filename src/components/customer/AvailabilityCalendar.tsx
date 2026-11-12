"use client";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { addDays, monthGrid, monthLabel, peakUseOnDay, type Scooter, type Taken } from "@/lib/rentals";

/**
 * Month calendar of scooter availability (no personal details). With a scooter chosen it shows that
 * scooter's booked days; otherwise how many scooters are free each day. Tapping a day picks it.
 */
export function AvailabilityCalendar({
  scooters,
  scooter,
  today,
  selected,
  onPick,
  refreshKey,
}: {
  scooters: Scooter[];
  scooter: Scooter | null;
  today: string;
  selected: string;
  onPick: (ymd: string) => void;
  refreshKey?: number;
}) {
  const [ym, setYm] = useState(() => ({ y: Number(selected.slice(0, 4)), m: Number(selected.slice(5, 7)) - 1 }));
  const [taken, setTaken] = useState<Taken[]>([]);
  const grid = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const first = grid.find(Boolean)!;
  const last = [...grid].reverse().find(Boolean)!;

  useEffect(() => {
    getSupabase()
      .rpc("scooter_calendar", { p_from: first, p_to: last })
      .then(({ data }) => setTaken((data as Taken[]) ?? []));
  }, [first, last, refreshKey]);

  const units = (s: Scooter) => Math.max(1, Number(s.units) || 1);
  const freeOn = (s: Scooter, ymd: string) => Math.max(0, units(s) - peakUseOnDay(taken.filter((t) => t.scooter_id === s.id), ymd));
  const dayInfo = (ymd: string) => {
    if (scooter) {
      const f = freeOn(scooter, ymd), u = units(scooter);
      return f === 0 ? { tone: "booked", label: "booked" } : f === u ? { tone: "free", label: u > 1 ? `${f} free` : "free" } : { tone: "some", label: `${f} of ${u} free` };
    }
    const total = scooters.reduce((n, s) => n + units(s), 0);
    const free = scooters.reduce((n, s) => n + freeOn(s, ymd), 0);
    return free === 0 ? { tone: "booked", label: "fully booked" } : free === total ? { tone: "free", label: `${free} free` } : { tone: "some", label: `${free} free` };
  };
  const maxMonth = addDays(today, 180).slice(0, 7);
  const cur = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}`;
  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));

  return (
    <div className="space-y-2" data-testid="availability-calendar" data-month={cur}>
      <div className="flex items-center justify-between">
        <button type="button" className="btn-ghost btn-sm" onClick={() => shift(-1)} disabled={cur <= today.slice(0, 7)} aria-label="Previous month">
          ‹
        </button>
        <p className="font-semibold">
          {monthLabel(ym.y, ym.m)}
          <span className="block text-center text-xs font-normal text-coffee-600">{scooter ? `Availability of ${scooter.name}` : "All scooters"}</span>
        </p>
        <button type="button" className="btn-ghost btn-sm" onClick={() => shift(1)} disabled={cur >= maxMonth} aria-label="Next month">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-coffee-600">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Availability calendar">
        {grid.map((d, i) => {
          if (!d) return <span key={i} />;
          const past = d < today;
          const info = dayInfo(d);
          const on = d === selected;
          const cls = past
            ? "bg-transparent text-coffee-300"
            : info.tone === "booked"
              ? "bg-stone-200 text-stone-500 line-through"
              : info.tone === "some"
                ? "bg-amber-100 text-amber-900"
                : "bg-sage-100 text-sage-700";
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              disabled={past}
              aria-label={`${d}: ${past ? "past" : info.label}`}
              aria-selected={on}
              data-day={d}
              data-tone={past ? "past" : info.tone}
              onClick={() => onPick(d)}
              className={`aspect-square rounded-lg text-sm font-semibold ${cls} ${on ? "ring-2 ring-coffee-800 ring-offset-1" : ""}`}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-3 text-xs text-coffee-700">
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-sage-100 align-middle" /> free
        </span>
        {(!scooter || units(scooter) > 1) && (
          <span>
            <span className="mr-1 inline-block h-3 w-3 rounded bg-amber-100 align-middle" /> some booked
          </span>
        )}
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-stone-200 align-middle" /> {scooter ? "booked (part or all of the day)" : "fully booked"}
        </span>
      </p>
    </div>
  );
}
