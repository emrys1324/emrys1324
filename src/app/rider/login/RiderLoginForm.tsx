"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert, Spinner } from "@/components/ui";
import { InstallPrompt } from "@/components/InstallPrompt";
import { getSupabase } from "@/lib/supabase/client";
import { useStoreSettings } from "@/lib/store-settings";
import { brandOf } from "@/lib/brands";

/** Sign-in page for delivery riders only; opens their deliveries (/rider). */
export function RiderLoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { settings } = useStoreSettings();
  const cafe = brandOf(settings, "cafe");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("denied") ? "This sign-in is for delivery riders. Staff sign in on the staff page." : null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setBusy(false);
      return setError(
        error?.message === "Invalid login credentials"
          ? "Wrong email or password."
          : /banned/i.test(error?.message ?? "")
            ? "This login has been switched off. Please ask the café."
            : (error?.message ?? "Sign-in failed."),
      );
    }
    const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).single();
    if (profile?.role !== "rider") {
      await supabase.auth.signOut();
      setBusy(false);
      return setError("This sign-in is for delivery riders. Staff sign in on the staff page.");
    }
    router.replace("/rider");
    router.refresh();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-4 py-10">
      <div className="text-center">
        <span aria-hidden className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sage-100 text-4xl">
          🛵
        </span>
        <p className="mt-3 font-display text-2xl font-bold">Padaya Rider</p>
        <p className="text-sm text-coffee-700">Deliveries for {cafe.name}</p>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-6" data-testid="rider-login">
        <div>
          <h1 className="font-display text-xl font-bold">Rider sign in</h1>
          <p className="text-sm text-coffee-700">Use the email and password from your invite.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="rider-email">
            Email
          </label>
          <input id="rider-email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="rider-password">
            Password
          </label>
          <input id="rider-password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn-primary w-full py-3 text-lg" disabled={busy}>
          {busy ? <Spinner /> : "Sign in"}
        </button>
        <p className="text-center text-xs text-coffee-600">Forgot your password? Ask the café to send you a new link.</p>
      </form>
      <InstallPrompt appName="Padaya Rider" pitch="Open your deliveries like an app — one tap from your home screen." />
      <p className="text-center text-sm text-coffee-600">
        Café staff?{" "}
        <Link href="/login" className="font-semibold underline">
          Staff sign in
        </Link>
      </p>
    </main>
  );
}
