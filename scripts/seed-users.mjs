// Creates the starter admin + rider logins. Run once after the SQL migration + seed:
//   npm run seed:users
// Reads .env.local (or real env vars): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// and optional SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_RIDER_EMAIL / SEED_RIDER_PASSWORD.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (put them in .env.local).");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const accounts = [
  { role: "admin", name: "Pahuway Admin", phone: "09170000001", email: process.env.SEED_ADMIN_EMAIL || "admin@pahuway.cafe", password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe-Admin-2026" },
  { role: "rider", name: "Jun Dela Cruz", phone: "09170000002", email: process.env.SEED_RIDER_EMAIL || "rider@pahuway.cafe", password: process.env.SEED_RIDER_PASSWORD || "ChangeMe-Rider-2026" },
];

async function findUser(email) {
  for (let page = 1; page < 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u || data.users.length < 200) return u ?? null;
  }
  return null;
}

for (const a of accounts) {
  let user = await findUser(a.email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: a.email,
      password: a.password,
      email_confirm: true,
      user_metadata: { full_name: a.name, phone: a.phone },
    });
    if (error) throw error;
    user = data.user;
    console.log(`Created ${a.role}: ${a.email}`);
  } else {
    console.log(`Exists  ${a.role}: ${a.email} (password unchanged)`);
  }
  const { error: upErr } = await supabase.from("users").upsert({ id: user.id, role: a.role, full_name: a.name, phone: a.phone, email: a.email });
  if (upErr) throw upErr;
  if (a.role === "rider") {
    const { data: existing } = await supabase.from("riders").select("id").eq("user_id", user.id).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("riders").insert({ user_id: user.id, name: a.name, phone: a.phone });
      if (error) throw error;
    }
  }
}
console.log("\nDone. Sign in at /login — and change these passwords before going live!");
