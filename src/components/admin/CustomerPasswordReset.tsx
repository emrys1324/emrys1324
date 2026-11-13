"use client";
import { useState } from "react";
import { Alert, Spinner } from "@/components/ui";

/** Admins: reset a mobile-number customer account and get a temporary password to tell them. */
export function CustomerPasswordReset() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string | null; phone: string; password: string } | null>(null);
  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!confirm(`Reset the password of the customer account ${phone.trim()}? Their old password stops working.`)) return;
    setBusy(true);
    const res = await fetch("/api/admin/customers/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(j.error ?? "Couldn't reset the password.");
    setResult(j);
    setPhone("");
  };
  return (
    <section className="card space-y-3 p-5" aria-labelledby="cust-reset-title" data-testid="customer-password-reset">
      <div>
        <h2 id="cust-reset-title" className="section-title">
          Customer password reset
        </h2>
        <p className="text-sm text-coffee-700">For customers who sign in with a mobile number (no email). Customers with an email reset it themselves with &ldquo;Forgot password?&rdquo;.</p>
      </div>
      <form onSubmit={reset} className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label className="label" htmlFor="cust-reset-phone">
            Customer&apos;s mobile number
          </label>
          <input id="cust-reset-phone" className="input" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09XXXXXXXXX" />
        </div>
        <button className="btn-secondary" disabled={busy || !phone.trim()}>
          {busy ? <Spinner /> : "Reset password"}
        </button>
      </form>
      {error && <Alert>{error}</Alert>}
      {result && (
        <Alert tone="green">
          <p>
            New temporary password for {result.name || "the customer"} ({result.phone}):
          </p>
          <p className="my-1 font-mono text-xl font-bold tracking-wide" data-testid="temp-password">
            {result.password}
          </p>
          <p className="font-normal">Tell the customer in person or by message. They sign in with their mobile number and this password, then change it under Account → Change password.</p>
        </Alert>
      )}
    </section>
  );
}
