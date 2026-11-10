"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/customer/Header";
import { Alert, Spinner } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const denied = params.get("denied");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(denied ? "That account doesn't have access to this page." : null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setBusy(false);
      return setError(error?.message === "Invalid login credentials" ? "Wrong email or password." : error?.message ?? "Sign-in failed.");
    }
    const { data: profile } = await supabase.from("users").select("role").eq("id", data.user.id).single();
    const role = profile?.role ?? "customer";
    const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : role === "admin" ? "/admin" : role === "rider" ? "/rider" : "/account";
    router.replace(dest);
    router.refresh();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>
      <form onSubmit={submit} className="card space-y-4 p-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Staff &amp; rider sign in</h1>
          <p className="text-sm text-coffee-700">Customers don&apos;t need an account to order.</p>
        </div>
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner /> : "Sign in"}
        </button>
      </form>
    </main>
  );
}
