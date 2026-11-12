import { NextResponse } from "next/server";
import { adminContext, cleanPerms, cleanPhone, fail, loadMember, otherActiveAdmins, setLoginEnabled } from "@/lib/team-admin";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

/** Edit someone. Body: { kind?: "admin" | "staff", permissions?, name?, phone?, active? } */
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // riders without a login: only name/phone/on-off on the rider record
  if (id.startsWith("rider:")) {
    const riderId = id.slice(6);
    const patch: Record<string, unknown> = {};
    if (typeof b.name === "string" && b.name.trim().length >= 2) patch.name = b.name.trim();
    if (b.phone !== undefined) patch.phone = cleanPhone(b.phone) || null;
    if (typeof b.active === "boolean") patch.is_active = b.active;
    const { error } = await ctx.db.from("riders").update(patch).eq("id", riderId);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }

  const m = await loadMember(ctx.db, id);
  if (!m) return fail("Team member not found.", 404);
  const self = id === ctx.me;
  try {
    if (b.kind !== undefined || b.permissions !== undefined) {
      if (self) return fail("You can't change your own access. Ask another admin.");
      if (m.role === "rider") return fail("Riders keep rider access. To make a rider staff, delete them and invite them as staff.");
      const kind = b.kind ?? m.role;
      if (kind !== "admin" && kind !== "staff") return fail("Choose Staff or Full admin.");
      const permissions = kind === "staff" ? cleanPerms(b.permissions ?? []) : [];
      if (kind === "staff" && permissions.length === 0) return fail("Tick at least one thing they can do.");
      if (m.role === "admin" && kind !== "admin" && m.is_active && (await otherActiveAdmins(ctx.db, id)) === 0)
        return fail("This is the only active admin. Make someone else a full admin first.");
      const { error } = await ctx.db.from("users").update({ role: kind, permissions }).eq("id", id);
      if (error) throw new Error(error.message);
    }
    if (typeof b.name === "string" || b.phone !== undefined) {
      const name = typeof b.name === "string" ? b.name.trim() : undefined;
      const phone = b.phone !== undefined ? cleanPhone(b.phone) : undefined;
      if (name !== undefined && name.length < 2) return fail("Enter their name.");
      if (phone && !/^09\d{9}$/.test(phone)) return fail("Mobile must look like 09XXXXXXXXX.");
      const patch = { ...(name !== undefined && { full_name: name }), ...(phone !== undefined && { phone: phone || null }) };
      await ctx.db.from("users").update(patch).eq("id", id);
      if (m.role === "rider") await ctx.db.from("riders").update({ ...(name !== undefined && { name }), ...(phone !== undefined && { phone: phone || null }) }).eq("user_id", id);
    }
    if (typeof b.active === "boolean") {
      if (self && !b.active) return fail("You can't switch off your own login.");
      if (!b.active && m.role === "admin" && (await otherActiveAdmins(ctx.db, id)) === 0)
        return fail("This is the only active admin. Make someone else a full admin first.");
      await setLoginEnabled(ctx.db, id, b.active);
    }
  } catch (e) {
    return fail((e as Error).message, 500);
  }
  return NextResponse.json({ ok: true });
}

/** Delete the login completely. Orders and deliveries they handled are kept. */
export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  if (id === ctx.me) return fail("You can't delete your own login here.");
  const m = await loadMember(ctx.db, id);
  if (!m) return fail("Team member not found.", 404);
  if (m.role === "admin" && m.is_active && (await otherActiveAdmins(ctx.db, id)) === 0)
    return fail("This is the only active admin. Make someone else a full admin first.");
  await ctx.db.from("riders").update({ is_active: false }).eq("user_id", id); // keeps delivery history, off the assign list
  const { error } = await ctx.db.auth.admin.deleteUser(id);
  return error ? fail(error.message, 500) : NextResponse.json({ deleted: true });
}
