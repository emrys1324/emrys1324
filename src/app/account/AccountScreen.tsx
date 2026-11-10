"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StoreHeader } from "@/components/customer/Header";
import { Alert, Badge, PageLoader, Spinner } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";
import { formatPeso, normalizePhone, ORDER_TYPE_LABEL, STATUS_LABEL } from "@/lib/format";
import { formatDateTime } from "@/lib/hours";
import { useStoreSettings } from "@/lib/store-settings";
import type { Order, Zone } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

interface Profile {
  role: string;
  full_name: string | null;
  phone: string | null;
  zone_id: string | null;
  street: string | null;
  landmark: string | null;
}

export function AccountScreen() {
  const { settings, open } = useStoreSettings();
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen pb-10">
      <StoreHeader settings={settings} open={open} back="/" />
      <main className="mx-auto max-w-lg px-4 py-5">
        {user === undefined ? <PageLoader /> : user ? <Profile user={user} /> : <AuthForms />}
      </main>
    </div>
  );
}

function AuthForms() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const supabase = getSupabase();
    if (mode === "signup") {
      if (name.trim().length < 2) return setMsg({ tone: "red", text: "Please enter your name." });
      const p = normalizePhone(phone);
      if (!p) return setMsg({ tone: "red", text: "Mobile number must look like 09XXXXXXXXX." });
      if (password.length < 8) return setMsg({ tone: "red", text: "Password must be at least 8 characters." });
      setBusy(true);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), phone: p }, emailRedirectTo: `${window.location.origin}/account` },
      });
      setBusy(false);
      if (error) return setMsg({ tone: "red", text: error.message });
      if (!data.session) setMsg({ tone: "green", text: "Almost done! Check your email to confirm your account, then sign in." });
    } else {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (error) setMsg({ tone: "red", text: error.message === "Invalid login credentials" ? "Wrong email or password." : error.message });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create an account"}</h1>
        <p className="text-coffee-700">Optional — save your address and see your past orders. You can always order as a guest.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-coffee-100 p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`min-h-[44px] rounded-xl font-semibold ${mode === m ? "bg-white shadow" : "text-coffee-700"}`}>
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="card space-y-4 p-5">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {mode === "signup" && (
          <>
            <div>
              <label className="label" htmlFor="su-name">
                Name
              </label>
              <input id="su-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="su-phone">
                Mobile number
              </label>
              <input id="su-phone" className="input" type="tel" inputMode="numeric" placeholder="09XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </>
        )}
        <div>
          <label className="label" htmlFor="a-email">
            Email
          </label>
          <input id="a-email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="a-pass">
            Password
          </label>
          <input id="a-pass" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner /> : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>
      <p className="text-center text-sm text-coffee-600">
        Staff or rider?{" "}
        <Link href="/login" className="font-semibold underline">
          Sign in here
        </Link>
      </p>
    </div>
  );
}

function Profile({ user }: { user: User }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    const [p, z, o] = await Promise.all([
      supabase.from("users").select("role, full_name, phone, zone_id, street, landmark").eq("id", user.id).single(),
      supabase.from("delivery_zones").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("orders").select("*").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(20),
    ]);
    setProfile((p.data as Profile) ?? { role: "customer", full_name: "", phone: "", zone_id: null, street: "", landmark: "" });
    setZones((z.data as Zone[]) ?? []);
    setOrders((o.data as Order[]) ?? []);
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile) return <PageLoader />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const phone = profile.phone ? normalizePhone(profile.phone) : null;
    if (profile.phone && !phone) return setMsg({ tone: "red", text: "Mobile number must look like 09XXXXXXXXX." });
    setSaving(true);
    const { error } = await getSupabase()
      .from("users")
      .update({ full_name: profile.full_name, phone, zone_id: profile.zone_id || null, street: profile.street, landmark: profile.landmark })
      .eq("id", user.id);
    setSaving(false);
    setMsg(error ? { tone: "red", text: error.message } : { tone: "green", text: "Saved! We'll fill these in at checkout." });
  };

  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setProfile({ ...profile, [k]: e.target.value });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Hi, {profile.full_name?.split(" ")[0] || "there"}!</h1>
          <p className="text-sm text-coffee-700">{user.email}</p>
        </div>
        <button
          className="btn-secondary btn-sm"
          onClick={async () => {
            await getSupabase().auth.signOut();
            window.location.href = "/";
          }}
        >
          Sign out
        </button>
      </div>

      {profile.role === "admin" && (
        <Link href="/admin" className="btn-primary w-full">
          Go to staff dashboard
        </Link>
      )}
      {profile.role === "rider" && (
        <Link href="/rider" className="btn-primary w-full">
          Go to my deliveries
        </Link>
      )}

      <form onSubmit={save} className="card space-y-4 p-5">
        <h2 className="section-title">Saved details</h2>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div>
          <label className="label" htmlFor="p-name">
            Name
          </label>
          <input id="p-name" className="input" value={profile.full_name ?? ""} onChange={set("full_name")} />
        </div>
        <div>
          <label className="label" htmlFor="p-phone">
            Mobile number
          </label>
          <input id="p-phone" className="input" type="tel" inputMode="numeric" placeholder="09XXXXXXXXX" value={profile.phone ?? ""} onChange={set("phone")} />
        </div>
        <div>
          <label className="label" htmlFor="p-zone">
            Barangay
          </label>
          <select id="p-zone" className="input" value={profile.zone_id ?? ""} onChange={set("zone_id")}>
            <option value="">—</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="p-street">
            House no. / Street / Purok
          </label>
          <input id="p-street" className="input" value={profile.street ?? ""} onChange={set("street")} />
        </div>
        <div>
          <label className="label" htmlFor="p-landmark">
            Landmark
          </label>
          <input id="p-landmark" className="input" value={profile.landmark ?? ""} onChange={set("landmark")} />
        </div>
        <button className="btn-primary w-full" disabled={saving}>
          {saving ? <Spinner /> : "Save"}
        </button>
      </form>

      <section className="card p-5">
        <h2 className="section-title mb-2">Order history</h2>
        {orders.length === 0 ? (
          <p className="text-coffee-700">No orders yet. Orders you place while signed in will show here.</p>
        ) : (
          <ul className="divide-y divide-coffee-100">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/order/${o.public_token}`} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-bold">{o.order_number}</p>
                    <p className="text-sm text-coffee-700">
                      {formatDateTime(o.created_at)} · {ORDER_TYPE_LABEL[o.order_type]}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatPeso(o.total)}</p>
                    <Badge tone={o.status === "cancelled" ? "red" : o.status === "completed" ? "green" : "amber"}>{STATUS_LABEL[o.status]}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
