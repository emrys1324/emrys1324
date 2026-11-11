"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, PageLoader, Spinner } from "@/components/ui";
import { formatDateTime } from "@/lib/hours";

type Access = "admin" | "staff";
interface StaffMember {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: Access;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}
const ACCESS_LABEL: Record<Access, string> = { staff: "Orders only", admin: "Full admin" };
const ACCESS_HINT: Record<Access, string> = {
  staff: "Orders board and Sold-out switches. No prices, zones, settings, refunds or sales.",
  admin: "Everything, including menu prices, settings, refunds, sales and staff.",
};
const EMPTY = { name: "", email: "", phone: "", password: "", access: "staff" as Access };

function makePassword() {
  const words = ["kape", "isla", "dagat", "araw", "tasa", "latte", "mocha", "beans"];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  return `${pick()}-${pick()}-${1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000)}`;
}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

export function StaffAdmin() {
  const [list, setList] = useState<StaffMember[] | null>(null);
  const [me, setMe] = useState<string>("");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await api("/api/admin/staff", "GET");
      setList(j.staff);
      setMe(j.me);
    } catch (e) {
      setList([]);
      setMsg({ tone: "red", text: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ tone: "green", text });
      await load();
    } catch (e) {
      setMsg({ tone: "red", text: (e as Error).message });
    }
    setBusy(null);
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    act("add", async () => {
      await api("/api/admin/staff", "POST", form);
      const done = `${form.name.trim()} can now sign in at /login with ${form.email.trim()} and the password you set (${ACCESS_LABEL[form.access]}).`;
      setForm(EMPTY);
      return done;
    });
  };

  if (!list) return <PageLoader />;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Staff</h1>
        <p className="text-coffee-700">Logins for your team. Everyone signs in at <span className="font-mono">/login</span>. Riders are managed in Settings → Riders.</p>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <form onSubmit={add} className="card space-y-3 p-5" aria-labelledby="add-staff-title">
        <h2 id="add-staff-title" className="section-title">
          Add staff
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="staff-name">
              Name
            </label>
            <input id="staff-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="staff-phone">
              Mobile <span className="font-normal text-coffee-600">(optional)</span>
            </label>
            <input id="staff-phone" className="input" inputMode="numeric" placeholder="09XXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="staff-email">
              Login email
            </label>
            <input id="staff-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="staff-password">
              Password
            </label>
            <div className="flex gap-2">
              <input id="staff-password" className="input flex-1" placeholder="8+ characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
              <button type="button" className="btn-secondary btn-sm" onClick={() => setForm({ ...form, password: makePassword() })}>
                Suggest
              </button>
            </div>
          </div>
        </div>
        <fieldset>
          <legend className="label">Access</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["staff", "admin"] as Access[]).map((a) => (
              <label key={a} className={`cursor-pointer rounded-2xl border-2 p-3 ${form.access === a ? "border-coffee-700 bg-coffee-50" : "border-coffee-200"}`}>
                <input type="radio" name="access" className="sr-only" checked={form.access === a} onChange={() => setForm({ ...form, access: a })} />
                <span className="block font-bold">{ACCESS_LABEL[a]}</span>
                <span className="block text-sm text-coffee-700">{ACCESS_HINT[a]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="hint">Share the email and password with them in person. They can&apos;t change their access themselves.</p>
        <button className="btn-primary w-full" disabled={busy === "add"}>
          {busy === "add" ? <Spinner /> : "Create staff login"}
        </button>
      </form>

      <section className="card p-5">
        <h2 className="section-title mb-2">Your team ({list.length})</h2>
        <ul className="divide-y divide-coffee-100">
          {list.map((s) => {
            const self = s.id === me;
            const name = s.full_name || s.email || "Staff";
            return (
              <li key={s.id} className="space-y-2 py-3" data-testid="staff-row" aria-label={name}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{name}</span>
                  {self && <Badge tone="blue">You</Badge>}
                  {!s.is_active && <Badge tone="gray">Switched off</Badge>}
                  <span className="ml-auto">
                    <label className="sr-only" htmlFor={`access-${s.id}`}>
                      Access for {name}
                    </label>
                    <select
                      id={`access-${s.id}`}
                      className="input py-1.5 text-sm"
                      value={s.role}
                      disabled={self || busy === s.id}
                      onChange={(e) => {
                        const access = e.target.value as Access; // read now: the controlled select snaps back until the list reloads
                        act(s.id, () => api(`/api/admin/staff/${s.id}`, "PATCH", { access }).then(() => `${name} now has ${ACCESS_LABEL[access]} access.`));
                      }}
                    >
                      <option value="staff">{ACCESS_LABEL.staff}</option>
                      <option value="admin">{ACCESS_LABEL.admin}</option>
                    </select>
                  </span>
                </div>
                <p className="text-sm text-coffee-700">
                  {s.email}
                  {s.phone ? ` · ${s.phone}` : ""} · {s.last_sign_in_at ? `last signed in ${formatDateTime(s.last_sign_in_at)}` : "never signed in"}
                </p>
                {!self && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-secondary btn-sm"
                      disabled={busy === s.id}
                      onClick={() =>
                        act(s.id, () =>
                          api(`/api/admin/staff/${s.id}`, "PATCH", { active: !s.is_active }).then(() =>
                            s.is_active ? `${name}'s login is switched off. They're signed out of staff pages right away.` : `${name} can sign in again.`,
                          ),
                        )
                      }
                    >
                      {s.is_active ? "Switch off login" : "Switch login back on"}
                    </button>
                    <button
                      className="btn-secondary btn-sm"
                      disabled={busy === s.id}
                      onClick={() => {
                        setResetFor(resetFor === s.id ? null : s.id);
                        setNewPassword(makePassword());
                      }}
                    >
                      Reset password
                    </button>
                    <button
                      className="btn-sm rounded-xl px-3 font-semibold text-red-700 hover:bg-red-50"
                      disabled={busy === s.id}
                      onClick={() => {
                        if (!confirm(`Delete ${name}'s login completely? Orders they handled are kept. This can't be undone.`)) return;
                        act(s.id, () => api(`/api/admin/staff/${s.id}`, "DELETE").then(() => `${name}'s login was deleted.`));
                      }}
                    >
                      Delete login
                    </button>
                  </div>
                )}
                {resetFor === s.id && (
                  <form
                    className="flex flex-wrap items-end gap-2 rounded-2xl bg-cream p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(s.id, async () => {
                        await api(`/api/admin/staff/${s.id}`, "PATCH", { password: newPassword });
                        setResetFor(null);
                        return `New password for ${name}: ${newPassword} — share it with them in person.`;
                      });
                    }}
                  >
                    <div className="flex-1">
                      <label className="label" htmlFor={`pw-${s.id}`}>
                        New password for {name}
                      </label>
                      <input id={`pw-${s.id}`} className="input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                    </div>
                    <button className="btn-primary btn-sm" disabled={busy === s.id}>
                      Set password
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
