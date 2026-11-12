import { NextResponse } from "next/server";
import { adminContext, cleanPerms, cleanPhone, fail, friendlyEmailError, inviteAccepted, KINDS, siteUrl, welcomeLink, type Kind } from "@/lib/team-admin";

export const runtime = "nodejs";

/** The team: admins, staff and riders, with invite status and last sign-in. */
export async function GET() {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const [{ data: people, error }, { data: riders }, { data: auth }] = await Promise.all([
    ctx.db.from("users").select("id, full_name, email, phone, role, is_active, permissions, created_at").in("role", KINDS).order("created_at"),
    ctx.db.from("riders").select("id, user_id, name, phone, is_active"),
    ctx.db.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (error) return fail(error.message, 500);
  const authById = new Map((auth?.users ?? []).map((u) => [u.id, u]));
  const members = (people ?? []).map((p) => {
    const a = authById.get(p.id);
    const rider = riders?.find((r) => r.user_id === p.id);
    return {
      ...p,
      full_name: rider?.name ?? p.full_name,
      phone: rider?.phone ?? p.phone,
      status: !p.is_active ? "off" : inviteAccepted(a) ? "active" : "invited",
      last_sign_in_at: a?.last_sign_in_at ?? null,
    };
  });
  // riders from before logins existed (no account) — shown so the list is complete
  const noLogin = (riders ?? []).filter((r) => !r.user_id).map((r) => ({ id: `rider:${r.id}`, full_name: r.name, phone: r.phone, role: "rider", is_active: r.is_active, status: "no_login", email: null, permissions: [], created_at: null, last_sign_in_at: null }));
  return NextResponse.json({ me: ctx.me, members: [...members, ...noLogin] });
}

/**
 * Invite someone. Body: { kind: "admin" | "staff" | "rider", name, email, phone?, permissions?: Perm[], send_email: boolean }
 * send_email → Supabase emails them a link; otherwise the response has a link to share yourself.
 */
export async function POST(req: Request) {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = b.kind as Kind;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const phone = cleanPhone(b.phone);
  const permissions = kind === "staff" ? cleanPerms(b.permissions) : [];
  if (!KINDS.includes(kind)) return fail("Choose Staff, Full admin or Rider.");
  if (name.length < 2) return fail("Enter their name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Enter a valid email — the invite goes there and it's their login.");
  if (phone && !/^09\d{9}$/.test(phone)) return fail("Mobile must look like 09XXXXXXXXX.");
  if (kind === "rider" && !phone) return fail("Riders need a mobile number (customers and staff call it).");
  if (kind === "staff" && permissions.length === 0) return fail("Tick at least one thing they can do.");

  const site = siteUrl(req);
  const meta = { data: { full_name: name, phone }, redirectTo: `${site}/welcome` };
  let userId: string;
  let link: string | null = null;
  if (b.send_email) {
    const { data, error } = await ctx.db.auth.admin.inviteUserByEmail(email, meta);
    if (error || !data.user) return fail(/already|registered|exists/i.test(error?.message ?? "") ? "That email already has a login." : friendlyEmailError(error?.message ?? "Could not send the invite."));
    userId = data.user.id;
  } else {
    const { data, error } = await ctx.db.auth.admin.generateLink({ type: "invite", email, options: meta });
    if (error || !data.user) return fail(/already|registered|exists/i.test(error?.message ?? "") ? "That email already has a login." : error?.message ?? "Could not create the invite.");
    userId = data.user.id;
    link = welcomeLink(site, data.properties.hashed_token, "invite");
  }

  const { error: e2 } = await ctx.db.from("users").upsert({ id: userId, role: kind, full_name: name, phone: phone || null, email, permissions, is_active: true });
  const { error: e3 } = kind === "rider" ? await ctx.db.from("riders").insert({ user_id: userId, name, phone }) : { error: null };
  if (e2 || e3) {
    await ctx.db.auth.admin.deleteUser(userId); // don't leave a half-made login behind
    return fail((e2 ?? e3)!.message, 500);
  }
  return NextResponse.json({ id: userId, link, emailed: !!b.send_email });
}
