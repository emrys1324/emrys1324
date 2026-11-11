import { NextResponse } from "next/server";
import { ACCESS, adminContext, fail, otherActiveAdmins, setLoginEnabled, validPassword, type Access } from "@/lib/staff-admin";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };

async function loadStaff(db: Parameters<typeof otherActiveAdmins>[0], id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from("users").select("id, role, is_active").eq("id", id).single();
  return data && ACCESS.includes(data.role as Access) ? (data as { id: string; role: Access; is_active: boolean }) : null;
}

/** Change access, switch the login on/off, or set a new password. Body: { access?, active?, password? } */
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  const target = await loadStaff(ctx.db, id);
  if (!target) return fail("Staff member not found.", 404);
  const b = (await req.json().catch(() => ({}))) as { access?: string; active?: boolean; password?: string };
  const self = id === ctx.me;

  try {
    if (b.access !== undefined) {
      if (!ACCESS.includes(b.access as Access)) return fail("Choose an access level.");
      if (self && b.access !== target.role) return fail("You can't change your own access. Ask another admin.");
      if (target.role === "admin" && b.access !== "admin" && target.is_active && (await otherActiveAdmins(ctx.db, id)) === 0)
        return fail("This is the only active admin. Make someone else an admin first.");
      const { error } = await ctx.db.from("users").update({ role: b.access }).eq("id", id);
      if (error) throw new Error(error.message);
    }
    if (b.active !== undefined) {
      if (self && !b.active) return fail("You can't switch off your own login.");
      if (!b.active && target.role === "admin" && (await otherActiveAdmins(ctx.db, id)) === 0)
        return fail("This is the only active admin. Make someone else an admin first.");
      await setLoginEnabled(ctx.db, id, !!b.active);
    }
    if (b.password !== undefined) {
      if (!validPassword(b.password)) return fail("Password must be 8 to 72 characters.");
      const { error } = await ctx.db.auth.admin.updateUserById(id, { password: b.password });
      if (error) throw new Error(error.message);
    }
  } catch (e) {
    return fail((e as Error).message, 500);
  }
  const { data } = await ctx.db.from("users").select("id, full_name, email, phone, role, is_active, created_at").eq("id", id).single();
  return NextResponse.json({ staff: data });
}

/** Delete the login completely (orders they handled are kept). */
export async function DELETE(_req: Request, { params }: Params) {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  if (id === ctx.me) return fail("You can't delete your own login here.");
  const target = await loadStaff(ctx.db, id);
  if (!target) return fail("Staff member not found.", 404);
  if (target.role === "admin" && target.is_active && (await otherActiveAdmins(ctx.db, id)) === 0)
    return fail("This is the only active admin. Make someone else an admin first.");
  const { error } = await ctx.db.auth.admin.deleteUser(id);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ deleted: true });
}
