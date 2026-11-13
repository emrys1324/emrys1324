import { NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { adminContext, fail } from "@/lib/team-admin";
import { normalizePhone } from "@/lib/format";
import { phoneLoginEmail } from "@/lib/phone-login";

/**
 * Admins reset the password of a customer account that signs in with a mobile number (no email to send a
 * reset link to). Returns a temporary password to tell the customer; they change it in their account.
 * Body: { phone }
 */
export const runtime = "nodejs";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes (l/1, o/0)
const tempPassword = () => Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")).join("-");

export async function POST(req: Request) {
  const ctx = await adminContext();
  if (ctx instanceof NextResponse) return ctx;
  const { phone } = (await req.json().catch(() => ({}))) as { phone?: string };
  const p = normalizePhone(phone ?? "");
  if (!p) return fail("Enter the customer's mobile number as 09XXXXXXXXX.", 400);
  const { data: u } = await ctx.db.from("users").select("id, full_name, role").eq("email", phoneLoginEmail(p)).maybeSingle();
  if (!u) return fail(`No customer account signs in with ${p}. Customers who signed up with an email can reset it themselves from "Forgot password?".`, 404);
  if (u.role !== "customer") return fail("That's a team login — reset it in the Team section instead.", 409);
  const password = tempPassword();
  const { error } = await ctx.db.auth.admin.updateUserById(u.id, { password });
  if (error) return fail("Couldn't reset the password: " + error.message, 500);
  return NextResponse.json({ name: u.full_name, phone: p, password });
}
