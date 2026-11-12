"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, PageLoader, Spinner } from "@/components/ui";
import { ScooterPhoto } from "./ScooterPhoto";
import { getSupabase } from "@/lib/supabase/client";
import { formatPeso, friendlyError, normalizePhone } from "@/lib/format";
import { resizeImage } from "@/lib/upload";
import { addDays, getRecentBooking, lastNight, manilaDate, prettyDate, rentalDays, saveRecentBooking, type RentalSettings, type Scooter } from "@/lib/rentals";

type Taken = { scooter_id: string; start_date: string; end_date: string };

/** Baybayin booking: dates → scooter → details & license → pay the deposit online. */
export function ScooterBooking({ rs, brandName }: { rs: RentalSettings; brandName: string }) {
  const today = manilaDate();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 1));
  const [scooters, setScooters] = useState<Scooter[] | null>(null);
  const [taken, setTaken] = useState<Taken[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [helmets, setHelmets] = useState(1);
  const [delivery, setDelivery] = useState(false);
  const [address, setAddress] = useState("");
  const [license, setLicense] = useState<File | null>(null);
  const [licensePreview, setLicensePreview] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ token: string; number: string } | null>(null);

  useEffect(() => setRecent(getRecentBooking()), []);
  useEffect(() => {
    getSupabase()
      .from("scooters")
      .select("*")
      .eq("is_active", true)
      .order("sort_order")
      .order("name")
      .then(({ data }) => setScooters((data as Scooter[]) ?? []));
  }, []);

  const validDates = start >= today && end >= start;
  const days = validDates ? rentalDays(start, end) : 0;
  const tooLong = days > rs.max_days;
  const loadTaken = async () => {
    if (!validDates) return;
    const { data } = await getSupabase().rpc("scooter_bookings_between", { p_from: start, p_to: lastNight(start, end) });
    setTaken((data as Taken[]) ?? []);
  };
  useEffect(() => {
    loadTaken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);
  useEffect(() => {
    if (!license) return setLicensePreview(null);
    const u = URL.createObjectURL(license);
    setLicensePreview(u);
    return () => URL.revokeObjectURL(u);
  }, [license]);

  const busyIds = useMemo(() => {
    if (!validDates) return new Set<string>();
    const last = lastNight(start, end);
    return new Set(taken.filter((t) => t.start_date <= last && t.end_date >= start).map((t) => t.scooter_id));
  }, [taken, start, end, validDates]);
  useEffect(() => {
    if (pick && busyIds.has(pick)) setPick(null);
  }, [busyIds, pick]);

  const scooter = scooters?.find((s) => s.id === pick) ?? null;
  const fee = delivery ? Number(rs.delivery_fee) : 0;
  const total = scooter ? days * Number(scooter.daily_rate) + fee : 0;
  const deposit = total ? Math.min(total, Math.max(1, Math.round((total * rs.deposit_percent) / 100))) : 0;

  const errors: Record<string, string> = {};
  if (!validDates) errors.dates = end < start ? "The return date must be on or after the pickup date." : "Pickup can't be in the past.";
  else if (tooLong) errors.dates = `Rentals can be up to ${rs.max_days} days.`;
  if (!scooter) errors.scooter = "Choose a scooter.";
  if (name.trim().length < 2) errors.name = "Please enter your name.";
  if (!normalizePhone(phone)) errors.phone = "Use the format 09XXXXXXXXX.";
  if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = "Please check your email.";
  if (delivery && address.trim().length < 5) errors.address = "Where should we bring the scooter?";
  if (!license) errors.license = "Please add a photo of your driver's license.";
  const show = (k: string) => (tried && errors[k] ? <p className="error-text">{errors[k]}</p> : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    setError(null);
    if (Object.keys(errors).length) {
      document.querySelector("[data-error=true]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    try {
      const db = getSupabase();
      const blob = await resizeImage(license!, 1600);
      const ext = blob.type === "image/jpeg" ? "jpg" : (license!.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `licenses/${today}/${crypto.randomUUID()}.${ext}`;
      const up = await db.storage.from("license-photos").upload(path, blob, { contentType: blob.type || license!.type, upsert: false });
      if (up.error) throw new Error("We couldn't upload your license photo. Please try again. " + up.error.message);
      const { data, error } = await db.rpc("book_scooter", {
        p: {
          scooter_id: scooter!.id,
          start_date: start,
          end_date: end,
          customer_name: name.trim(),
          customer_phone: normalizePhone(phone),
          customer_email: email.trim() || null,
          helmets,
          delivery,
          delivery_address: delivery ? address.trim() : null,
          license_path: path,
          notes,
        },
      });
      if (error) {
        if (/UNAVAILABLE/.test(error.message)) await loadTaken();
        throw new Error(error.message);
      }
      saveRecentBooking(data.token, data.booking_number);
      const res = await fetch("/api/rentals/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: data.token }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        window.location.href = j.url;
        return;
      }
      window.location.href = `/baybayin/booking/${data.token}`; // the booking page offers "Pay now" again
    } catch (err) {
      setError(friendlyError((err as Error).message));
      setBusy(false);
    }
  };

  if (!scooters) return <PageLoader />;
  return (
    <form onSubmit={submit} noValidate className="space-y-4 pb-32">
      {recent && (
        <Link href={`/baybayin/booking/${recent.token}`} className="block rounded-2xl bg-sky-100 px-4 py-3 text-sm font-semibold text-sky-900">
          Your booking {recent.number} → view status
        </Link>
      )}

      {/* 1 · Dates */}
      <section className="card space-y-3 p-5" data-error={tried && !!errors.dates}>
        <h2 className="section-title">When?</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pickup-date">
              Pickup
            </label>
            <input
              id="pickup-date"
              type="date"
              className="input"
              min={today}
              max={addDays(today, 180)}
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end < e.target.value) setEnd(addDays(e.target.value, 1));
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="return-date">
              Return
            </label>
            <input id="return-date" type="date" className="input" min={start} max={addDays(start, rs.max_days)} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {validDates && !tooLong ? (
          <p className="hint" data-testid="rental-days">
            {prettyDate(start)} → {prettyDate(end)} · <strong>{days} day{days === 1 ? "" : "s"}</strong> (returning the same day counts as 1 day)
          </p>
        ) : (
          <p className="error-text">{errors.dates}</p>
        )}
      </section>

      {/* 2 · Scooter */}
      <section className="card space-y-3 p-5" data-error={tried && !!errors.scooter}>
        <h2 className="section-title">Choose a scooter</h2>
        {scooters.length === 0 && <p className="text-coffee-700">No scooters are available to book yet. Please check back soon.</p>}
        <div className="grid gap-3" role="radiogroup" aria-label="Scooter">
          {scooters.map((s) => {
            const booked = busyIds.has(s.id);
            const on = pick === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${s.name}${booked ? " (booked)" : ""}`}
                disabled={booked || !validDates}
                onClick={() => setPick(s.id)}
                data-testid="scooter-option"
                className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${on ? "border-coffee-700 bg-coffee-50" : "border-coffee-200 bg-white"}`}
              >
                <ScooterPhoto src={s.photo_url} alt={s.name} className="h-20 w-20 shrink-0 rounded-xl" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{s.name}</span>
                  {s.description && <span className="block text-sm text-coffee-700">{s.description}</span>}
                  <span className="mt-1 block text-sm">
                    <strong className="tabular-nums">{formatPeso(s.daily_rate)}</strong>/day
                    {validDates && !tooLong && days > 1 && <span className="text-coffee-700"> · {formatPeso(days * Number(s.daily_rate))} for {days} days</span>}
                  </span>
                </span>
                {booked && <Badge tone="gray">Booked</Badge>}
              </button>
            );
          })}
        </div>
        {show("scooter")}
      </section>

      {/* 3 · Details */}
      <section className="card space-y-4 p-5">
        <h2 className="section-title">Your details</h2>
        <div data-error={tried && !!errors.name}>
          <label className="label" htmlFor="renter-name">
            Name (as on your license)
          </label>
          <input id="renter-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          {show("name")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div data-error={tried && !!errors.phone}>
            <label className="label" htmlFor="renter-phone">
              Mobile number
            </label>
            <input id="renter-phone" className="input" type="tel" inputMode="numeric" autoComplete="tel" placeholder="09XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {show("phone")}
          </div>
          <div data-error={tried && !!errors.email}>
            <label className="label" htmlFor="renter-email">
              Email <span className="font-normal text-coffee-600">(optional, for the receipt)</span>
            </label>
            <input id="renter-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {show("email")}
          </div>
        </div>
        <fieldset>
          <legend className="label">Helmets</legend>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Helmets">
            {[0, 1, 2].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={helmets === n} onClick={() => setHelmets(n)} className={`rounded-xl border-2 py-2.5 font-semibold ${helmets === n ? "border-coffee-700 bg-coffee-50" : "border-coffee-200 bg-white"}`}>
                {n === 0 ? "None" : n === 1 ? "1 (rider)" : "2 (+ passenger)"}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2" data-error={tried && !!errors.address}>
          <label className="flex items-center gap-3 font-medium">
            <input type="checkbox" className="h-5 w-5 accent-coffee-700" checked={delivery} onChange={(e) => setDelivery(e.target.checked)} />
            Deliver the scooter to my place {Number(rs.delivery_fee) > 0 ? `(+${formatPeso(rs.delivery_fee)})` : "(free)"}
          </label>
          {delivery && (
            <>
              <label className="label" htmlFor="delivery-address">
                Resort / house and barangay
              </label>
              <input id="delivery-address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="e.g. Kamandag Beach Resort, Poblacion" />
              {show("address")}
            </>
          )}
          {!delivery && rs.pickup_note && <p className="hint">Pickup: {rs.pickup_note}</p>}
        </div>
        <div data-error={tried && !!errors.license}>
          <span className="label">Driver&apos;s license photo</span>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-coffee-200 p-3">
            {licensePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={licensePreview} alt="Your license photo" className="h-16 w-24 rounded-lg object-cover" />
            ) : (
              <span aria-hidden className="flex h-16 w-24 items-center justify-center rounded-lg bg-cream text-2xl">
                🪪
              </span>
            )}
            <span className="text-sm">
              <span className="block font-semibold">{license ? "Change photo" : "Add a photo of your license"}</span>
              <span className="text-coffee-700">Only Baybayin staff can see it. JPG or PNG, max 5 MB.</span>
            </span>
            <input type="file" accept="image/*" className="sr-only" aria-label="Driver's license photo" onChange={(e) => setLicense(e.target.files?.[0] ?? null)} />
          </label>
          {show("license")}
        </div>
        <div>
          <label className="label" htmlFor="renter-notes">
            Notes <span className="font-normal text-coffee-600">(optional, e.g. pickup time)</span>
          </label>
          <input id="renter-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} placeholder="I'll pick it up around 9 AM" />
        </div>
      </section>

      {/* 4 · Summary */}
      {scooter && validDates && !tooLong && (
        <section className="card space-y-2 p-5" data-testid="rental-summary">
          <h2 className="section-title">Summary</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt>
                {scooter.name} · {days} day{days === 1 ? "" : "s"} × {formatPeso(scooter.daily_rate)}
              </dt>
              <dd className="tabular-nums">{formatPeso(days * Number(scooter.daily_rate))}</dd>
            </div>
            {delivery && (
              <div className="flex justify-between gap-3">
                <dt>Delivery</dt>
                <dd className="tabular-nums">{formatPeso(fee)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-coffee-100 pt-2 text-base font-bold">
              <dt>Total rental</dt>
              <dd className="tabular-nums">{formatPeso(total)}</dd>
            </div>
            <div className="flex justify-between gap-3 font-semibold text-sage-700">
              <dt>Deposit to pay now ({rs.deposit_percent}%)</dt>
              <dd className="tabular-nums">{formatPeso(deposit)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Balance at pickup</dt>
              <dd className="tabular-nums">{formatPeso(total - deposit)}</dd>
            </div>
          </dl>
          {Number(rs.security_deposit) > 0 && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="security-deposit">
              <strong>Security deposit at pickup: {formatPeso(rs.security_deposit)}</strong>
              {rs.security_deposit_note ? ` ${rs.security_deposit_note}` : ""} — returned when the scooter comes back in good condition.
            </p>
          )}
          <p className="hint">The deposit secures your booking. Pay with QR Ph (GCash, Maya or your bank app) or online banking. Unpaid bookings are released after 30 minutes.</p>
        </section>
      )}

      {error && <Alert>{error}</Alert>}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-coffee-100 bg-cream/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-lg">
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner /> : deposit ? `Pay ${formatPeso(deposit)} deposit` : `Book a scooter from ${brandName}`}
          </button>
        </div>
      </div>
    </form>
  );
}
