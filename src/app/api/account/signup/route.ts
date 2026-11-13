import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/format";
import { phoneLoginEmail } from "@/lib/phone-login";

/**
 * Customer sign-up WITHOUT an email: creates an account that signs in with the mobile number + password.
 * (Sign-ups with an email go through Supabase directly and confirm by email, as before.)
 * Body: { name, phone, password }
 */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = getAdminSupabase();
  if (!db) return NextResponse.json({ error: "Sign-up isn't available right now. Please try again later." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { name?: string; phone?: string; password?: string };
  const name = (b.name ?? "").trim().slice(0, 80);
  const phone = normalizePhone(b.phone ?? "");
  const password = b.password ?? "";
  if (name.length < 2) return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Mobile number must look like 09XXXXXXXXX." }, { status: 400 });
  if (password.length < 8 || password.length > 72) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const { error } = await db.auth.admin.createUser({
    email: phoneLoginEmail(phone),
    password,
    email_confirm: true,
    user_metadata: { full_name: name, phone, phone_login: true },
  });
  if (error) {
    if (/already|exists|registered/i.test(error.message)) return NextResponse.json({ error: "An account with this mobile number already exists. Please sign in instead." }, { status: 409 });
    console.error("phone sign-up failed", error.message);
    return NextResponse.json({ error: "We couldn't create your account. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, login: phone });
}
