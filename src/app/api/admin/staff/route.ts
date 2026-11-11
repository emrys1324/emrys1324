import { NextResponse } from "next/server";
import { ACCESS, adminContext, fail, validPassword, type Access } from "@/lib/staff-admin";

export const runtime = "nodejs";

/** Staff list: admins + "Orders only" staff, with last sign-in. */
export async function GET() {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const { data, error } = await ctx.db
    .from("users")
    .select("id, full_name, email, phone, role, is_active, created_at")
    .in("role", ACCESS)
    .order("created_at");
  if (error) return fail(error.message, 500);
  const { data: auth } = await ctx.db.auth.admin.listUsers({ perPage: 1000 });
  const lastSeen = new Map((auth?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
  return NextResponse.json({ me: ctx.me, staff: (data ?? []).map((u) => ({ ...u, last_sign_in_at: lastSeen.get(u.id) ?? null })) });
}

/** Add a staff login. Body: { name, email, phone?, password, access: "staff" | "admin" } */
export async function POST(req: Request) {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const b = (await req.json().catch(() => ({}))) as { name?: string; email?: string; phone?: string; password?: string; access?: string };
  const name = b.name?.trim() ?? "";
  const email = b.email?.trim().toLowerCase() ?? "";
  const phone = (b.phone ?? "").replace(/[\s-]/g, "");
  const access = b.access as Access;
  if (name.length < 2) return fail("Enter the staff member's name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Enter a valid email — it's their login.");
  if (phone && !/^09\d{9}$/.test(phone)) return fail("Mobile must look like 09XXXXXXXXX.");
  if (!validPassword(b.password)) return fail("Password must be 8 to 72 characters.");
  if (!ACCESS.includes(access)) return fail("Choose an access level.");

  const { data: created, error } = await ctx.db.auth.admin.createUser({
    email,
    password: b.password,
    email_confirm: true,
    user_metadata: { full_name: name, phone },
  });
  if (error || !created.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? "");
    return fail(taken ? "That email already has a login. Use a different email." : error?.message ?? "Could not create the login.");
  }
  const { data: user, error: e2 } = await ctx.db
    .from("users")
    .upsert({ id: created.user.id, role: access, full_name: name, phone: phone || null, email, is_active: true })
    .select("id, full_name, email, phone, role, is_active, created_at")
    .single();
  if (e2) {
    await ctx.db.auth.admin.deleteUser(created.user.id); // don't leave a half-made login behind
    return fail(e2.message, 500);
  }
  return NextResponse.json({ staff: { ...user, last_sign_in_at: null } });
}
