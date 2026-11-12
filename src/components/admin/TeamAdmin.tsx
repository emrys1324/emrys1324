"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Spinner } from "@/components/ui";
import { formatDateTime } from "@/lib/hours";
import { PERMISSIONS, type Perm } from "@/lib/permissions";

type Kind = "admin" | "staff" | "rider";
type Status = "active" | "invited" | "off" | "no_login";
interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: Kind;
  is_active: boolean;
  permissions: Perm[] | null;
  status: Status;
  last_sign_in_at: string | null;
}
const KIND_LABEL: Record<Kind, string> = { staff: "Staff", admin: "Full admin", rider: "Rider" };
const KIND_HINT: Record<Kind, string> = {
  staff: "Only what you tick below.",
  admin: "Everything, including this Team list.",
  rider: "Their assigned deliveries only.",
};
const PRESETS: { label: string; perms: Perm[] }[] = [
  { label: "Barista", perms: ["orders", "stock", "open_close"] },
  { label: "Supervisor", perms: ["orders", "stock", "open_close", "menu", "refunds", "sales"] },
];
const permLabel = (p: Perm) => PERMISSIONS.find((x) => x.key === p)?.label ?? p;
const EMPTY = { kind: "staff" as Kind, name: "", email: "", phone: "", permissions: ["orders", "stock"] as Perm[], send_email: true };

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

function PermissionBoxes({ value, onChange, idPrefix }: { value: Perm[]; onChange: (v: Perm[]) => void; idPrefix: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="label">What can they do?</legend>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="btn-secondary btn-sm" onClick={() => onChange(p.perms)}>
            {p.label} preset
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PERMISSIONS.map((p) => {
          const id = `${idPrefix}-${p.key}`;
          const on = value.includes(p.key);
          return (
            <label key={p.key} htmlFor={id} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 ${on ? "border-coffee-600 bg-coffee-50" : "border-coffee-200"}`}>
              <input id={id} type="checkbox" className="mt-1 h-5 w-5 accent-coffee-700" checked={on} onChange={(e) => onChange(e.target.checked ? [...value, p.key] : value.filter((x) => x !== p.key))} />
              <span>
                <span className="block font-semibold">{p.label}</span>
                <span className="block text-sm text-coffee-700">{p.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function KindPicker({ value, onChange, kinds, name }: { value: Kind; onChange: (k: Kind) => void; kinds: Kind[]; name: string }) {
  return (
    <fieldset>
      <legend className="label">Role</legend>
      <div className={`grid gap-2 ${kinds.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {kinds.map((k) => (
          <label key={k} className={`cursor-pointer rounded-2xl border-2 p-3 ${value === k ? "border-coffee-700 bg-coffee-50" : "border-coffee-200"}`}>
            <input type="radio" name={name} className="sr-only" checked={value === k} onChange={() => onChange(k)} />
            <span className="block font-bold">{KIND_LABEL[k]}</span>
            <span className="block text-sm text-coffee-700">{KIND_HINT[k]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LinkBox({ link, note }: { link: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-2xl bg-sage-100 p-3" data-testid="invite-link">
      <p className="text-sm font-semibold text-sage-700">{note}</p>
      <div className="flex gap-2">
        <input className="input flex-1 font-mono text-xs" value={link} readOnly aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false))}
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-coffee-700">It works once and expires after about an hour (Supabase setting). You can always make a new one.</p>
    </div>
  );
}

export function TeamSection() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [me, setMe] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  const [link, setLink] = useState<{ id: string; link: string; note: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ kind: Kind; permissions: Perm[]; name: string; phone: string }>({ kind: "staff", permissions: [], name: "", phone: "" });

  const load = useCallback(async () => {
    try {
      const j = await api("/api/admin/team", "GET");
      setMembers(j.members);
      setMe(j.me);
    } catch (e) {
      setMembers([]);
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

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    act("invite", async () => {
      const j = await api("/api/admin/team", "POST", form);
      const name = form.name.trim();
      setLink(j.link ? { id: "new", link: j.link, note: `Send this link to ${name} (Messenger, SMS…). They'll set their own password.` } : null);
      setForm({ ...EMPTY, kind: form.kind, permissions: form.permissions, send_email: form.send_email });
      return j.emailed ? `Invite sent to ${form.email.trim()}. ${name} sets a password from the email, then signs in at /login.` : `${name} is added. Share the link below with them.`;
    });
  };

  if (!members) return <section className="card p-5">Loading team…</section>;
  return (
    <section className="card space-y-4 p-5" aria-labelledby="team-title">
      <div>
        <h2 id="team-title" className="section-title">
          Team
        </h2>
        <p className="text-sm text-coffee-700">Staff, admins and riders. Invite people by email — they set their own password, then sign in at <span className="font-mono">/login</span>.</p>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {link?.id === "new" && <LinkBox link={link.link} note={link.note} />}

      <form onSubmit={invite} className="space-y-3 rounded-2xl bg-cream p-4" aria-label="Invite someone">
        <p className="font-bold">Invite someone</p>
        <KindPicker value={form.kind} onChange={(kind) => setForm({ ...form, kind })} kinds={["staff", "admin", "rider"]} name="invite-kind" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="invite-name">
              Name
            </label>
            <input id="invite-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="invite-email">
              Email
            </label>
            <input id="invite-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="invite-phone">
              Mobile {form.kind !== "rider" && <span className="font-normal text-coffee-600">(optional)</span>}
            </label>
            <input id="invite-phone" className="input" inputMode="numeric" placeholder="09XXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        {form.kind === "staff" && <PermissionBoxes value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} idPrefix="invite-perm" />}
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" className="h-5 w-5 accent-coffee-700" checked={form.send_email} onChange={(e) => setForm({ ...form, send_email: e.target.checked })} />
          Email the invite to them
          <span className="font-normal text-coffee-600">(untick to get a link you can send yourself)</span>
        </label>
        <button className="btn-primary w-full" disabled={busy === "invite"}>
          {busy === "invite" ? <Spinner /> : form.send_email ? "Send invite" : "Create invite link"}
        </button>
      </form>

      <ul className="divide-y divide-coffee-100">
        {members.map((m) => {
          const self = m.id === me;
          const name = m.full_name || m.email || "Team member";
          const hasLogin = m.status !== "no_login";
          return (
            <li key={m.id} className="space-y-2 py-3" data-testid="team-row" aria-label={name}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{name}</span>
                <Badge tone={m.role === "admin" ? "brown" : m.role === "rider" ? "blue" : "green"}>{KIND_LABEL[m.role]}</Badge>
                {self && <Badge tone="blue">You</Badge>}
                {m.status === "invited" && <Badge tone="amber">Invited</Badge>}
                {m.status === "off" && <Badge tone="gray">Switched off</Badge>}
                {m.status === "no_login" && <Badge tone="gray">No login</Badge>}
              </div>
              <p className="text-sm text-coffee-700">
                {[m.email, m.phone].filter(Boolean).join(" · ")}
                {hasLogin && ` · ${m.last_sign_in_at ? `last signed in ${formatDateTime(m.last_sign_in_at)}` : "hasn't signed in yet"}`}
              </p>
              {m.role === "staff" && (
                <p className="flex flex-wrap gap-1.5" aria-label={`${name} can`}>
                  {(m.permissions ?? []).map((p) => (
                    <span key={p} className="rounded-full bg-coffee-50 px-2.5 py-0.5 text-xs font-semibold text-coffee-800">
                      {permLabel(p)}
                    </span>
                  ))}
                </p>
              )}
              {!self && (
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary btn-sm"
                    disabled={busy === m.id}
                    onClick={() => {
                      setEditing(editing === m.id ? null : m.id);
                      setDraft({ kind: m.role, permissions: m.permissions ?? [], name: m.full_name ?? "", phone: m.phone ?? "" });
                    }}
                  >
                    Edit
                  </button>
                  {hasLogin && m.is_active && (
                    <>
                      <button
                        className="btn-secondary btn-sm"
                        disabled={busy === m.id}
                        onClick={() =>
                          act(m.id, async () => {
                            const j = await api(`/api/admin/team/${m.id}/link`, "POST");
                            setLink({ id: m.id, link: j.link, note: `Send this to ${name}. It lets them set a ${m.status === "invited" ? "" : "new "}password.` });
                          })
                        }
                      >
                        {m.status === "invited" ? "Copy invite link" : "Copy password-reset link"}
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        disabled={busy === m.id}
                        onClick={() =>
                          act(m.id, () => api(`/api/admin/team/${m.id}/email`, "POST").then(() => `Email sent to ${m.email}. It has a link to set a password.`))
                        }
                      >
                        {m.status === "invited" ? "Resend invite email" : "Email password reset"}
                      </button>
                    </>
                  )}
                  <button
                    className="btn-secondary btn-sm"
                    disabled={busy === m.id}
                    onClick={() =>
                      act(m.id, () =>
                        api(`/api/admin/team/${m.id}`, "PATCH", { active: !m.is_active }).then(() =>
                          m.is_active ? `${name} is switched off — locked out right away. History is kept.` : `${name} is switched back on.`,
                        ),
                      )
                    }
                  >
                    {m.is_active ? "Switch off" : "Switch back on"}
                  </button>
                  {hasLogin && (
                    <button
                      className="btn-sm rounded-xl px-3 font-semibold text-red-700 hover:bg-red-50"
                      disabled={busy === m.id}
                      onClick={() => {
                        if (!confirm(`Delete ${name}'s login completely? Orders and deliveries they handled are kept. This can't be undone.`)) return;
                        act(m.id, () => api(`/api/admin/team/${m.id}`, "DELETE").then(() => `${name}'s login was deleted.`));
                      }}
                    >
                      Delete login
                    </button>
                  )}
                </div>
              )}
              {link?.id === m.id && <LinkBox link={link.link} note={link.note} />}
              {editing === m.id && (
                <form
                  className="space-y-3 rounded-2xl bg-cream p-4"
                  aria-label={`Edit ${name}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(m.id, async () => {
                      const body: Record<string, unknown> = { name: draft.name, phone: draft.phone };
                      if (m.role !== "rider") Object.assign(body, { kind: draft.kind, permissions: draft.kind === "staff" ? draft.permissions : [] });
                      await api(`/api/admin/team/${m.id}`, "PATCH", body);
                      setEditing(null);
                      return `${draft.name || name} is updated.`;
                    });
                  }}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor={`edit-name-${m.id}`}>
                        Name
                      </label>
                      <input id={`edit-name-${m.id}`} className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="label" htmlFor={`edit-phone-${m.id}`}>
                        Mobile
                      </label>
                      <input id={`edit-phone-${m.id}`} className="input" inputMode="numeric" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                    </div>
                  </div>
                  {m.role !== "rider" && hasLogin && (
                    <>
                      <KindPicker value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} kinds={["staff", "admin"]} name={`edit-kind-${m.id}`} />
                      {draft.kind === "staff" && <PermissionBoxes value={draft.permissions} onChange={(permissions) => setDraft({ ...draft, permissions })} idPrefix={`edit-perm-${m.id}`} />}
                    </>
                  )}
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm" disabled={busy === m.id}>
                      Save changes
                    </button>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
