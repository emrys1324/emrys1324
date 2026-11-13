"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/customer/Header";
import { Alert, PageLoader, Spinner } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { firstStaffPage, isPerm, ALL_PERMS } from "@/lib/permissions";
import type { EmailOtpType } from "@supabase/supabase-js";

type Profile = { full_name: string | null; role: string; permissions: string[] | null; is_active: boolean | null };

/**
 * Landing page for team invites and set-password links. Handles all three link styles Supabase can produce:
 * our own ?token_hash=…&type=…, the email's #access_token=…, and ?code=… — then asks for a password.
 */
export function WelcomeForm() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "error">("checking");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [isReset, setIsReset] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    const url0 = new URL(window.location.href);
    const reset = url0.searchParams.get("reset") === "1";
    setIsReset(reset);
    const expired = reset
      ? "This reset link has expired or was already used. Request a new one from the sign-in page."
      : "This link has expired or was already used. Ask the café admin to send you a new one.";
    (async () => {
      const url = url0;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      const q = url.searchParams;
      try {
        if (hash.get("error") || q.get("error")) throw new Error(expired);
        if (hash.get("access_token") && hash.get("refresh_token")) {
          const { error } = await supabase.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! });
          if (error) throw new Error(expired);
        } else if (q.get("token_hash") && q.get("type")) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: q.get("token_hash")!, type: q.get("type") as EmailOtpType });
          if (error) throw new Error(expired);
        } else if (q.get("code")) {
          const { error } = await supabase.auth.exchangeCodeForSession(q.get("code")!);
          // the Supabase client may already have exchanged the code on load — fine if we're signed in now
          if (error && !(await supabase.auth.getSession()).data.session) throw new Error(expired);
        }
        window.history.replaceState(null, "", "/welcome"); // drop the one-time token from the address bar
        const { data } = await supabase.auth.getUser();
        if (!data.user) throw new Error("Open the link from your invite email or message to set your password.");
        setEmail(data.user.email ?? "");
        const { data: p } = await supabase.from("users").select("full_name, role, permissions, is_active").eq("id", data.user.id).single();
        if (p && p.is_active === false) throw new Error("This login has been switched off. Please ask the café admin.");
        setProfile(p as Profile);
        setState("ready");
      } catch (e) {
        setError((e as Error).message);
        setState("error");
      }
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const { error } = await getSupabase().auth.updateUser({ password });
    if (error) {
      setBusy(false);
      return setError(/different from the old/i.test(error.message) ? "Choose a password you haven't used before." : error.message);
    }
    const perms = profile?.role === "admin" ? ALL_PERMS : (profile?.permissions ?? []).filter(isPerm);
    const dest = profile?.role === "rider" ? "/rider" : profile?.role === "admin" || profile?.role === "staff" ? (firstStaffPage(perms) ?? "/account") : "/account";
    router.replace(dest);
    router.refresh();
  };

  if (state === "checking") return <PageLoader />;
  const first = profile?.full_name?.split(" ")[0];
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>
      {state === "error" ? (
        <div className="card space-y-4 p-6">
          <h1 className="font-display text-2xl font-bold">Link problem</h1>
          <Alert>{error}</Alert>
          <Link href={isReset ? "/account" : "/login"} className="btn-secondary w-full">
            Go to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <h1 className="font-display text-2xl font-bold">{isReset ? "Choose a new password" : first ? `Welcome, ${first}!` : "Welcome!"}</h1>
            <p className="text-sm text-coffee-700">
              {isReset || profile?.role === "customer" ? (
                <>
                  Set a new password for <strong>{email}</strong>.
                </>
              ) : (
                <>
                  Set a password for <strong>{email}</strong>. You&apos;ll use it to sign in at <span className="font-mono">{profile?.role === "rider" ? "/rider/login" : "/login"}</span>.
                </>
              )}
            </p>
          </div>
          {error && <Alert>{error}</Alert>}
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <div>
            <label className="label" htmlFor="new-password">
              New password
            </label>
            <input id="new-password" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" />
          </div>
          <div>
            <label className="label" htmlFor="confirm-password">
              Type it again
            </label>
            <input id="confirm-password" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? <Spinner /> : "Save password and continue"}
          </button>
        </form>
      )}
    </main>
  );
}
