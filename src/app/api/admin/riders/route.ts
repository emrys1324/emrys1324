import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionRole } from "@/lib/supabase/server";

/**
 * Creates a rider login (needs the service-role key, so it runs on the server).
 * Only a signed-in admin may call it.
 */
export async function POST(req: Request) {
  const session = await getSessionRole();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server. See README → Environment variables." }, { status: 501 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string; phone?: string; email?: string; password?: string };
  const name = body.name?.trim() ?? "";
  const phone = (body.phone ?? "").replace(/[\s-]/g, "");
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (name.length < 2) return NextResponse.json({ error: "Enter the rider's name." }, { status: 400 });
  if (phone && !/^09\d{9}$/.test(phone)) return NextResponse.json({ error: "Mobile must look like 09XXXXXXXXX." }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email for the rider's login." }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, phone },
  });
  if (error || !created.user) return NextResponse.json({ error: error?.message ?? "Could not create login" }, { status: 400 });

  const uid = created.user.id;
  const { error: roleErr } = await admin.from("users").upsert({ id: uid, role: "rider", full_name: name, phone: phone || null, email });
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });
  const { data: rider, error: riderErr } = await admin.from("riders").insert({ user_id: uid, name, phone: phone || null }).select().single();
  if (riderErr) return NextResponse.json({ error: riderErr.message }, { status: 500 });

  return NextResponse.json({ rider });
}
