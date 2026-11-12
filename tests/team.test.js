// Team (Settings → Team): invite staff/admins/riders by email or link, per-person permissions,
// /welcome set-password page, password-reset links/emails, switch off/on, delete, safety rules.
// Needs local Supabase WITH the email catcher (npx supabase start, mailpit on :54324) + seed:users + app on :3000.
// Run: npm run test:team
const { chromium, devices } = require("playwright");
const { execFileSync } = require("child_process");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const MAIL = "http://127.0.0.1:54324/api/v1";
const sql = (q) => execFileSync("docker", ["exec", "-i", "supabase_db_pahuway-cafe", "psql", "-U", "postgres", "-Atc", q]).toString().trim();
const assert = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("ok", m);
};
const BEA = { name: "Bea Barista", email: "bea.barista@example.com" };
const RICO = { name: "Rico Rider", email: "rico.rider@example.com", phone: "09171230001" };
const MARA = { name: "Mara Manager", email: "mara.manager@example.com" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new Error("FAIL: timed out waiting for " + what);
};

/** Latest email to `to` received after `after` (ms) — returns the set-password link inside it. */
async function mailLink(to, after) {
  const msg = await until(async () => {
    const r = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    return (r.messages ?? []).find((m) => new Date(m.Created).getTime() >= after - 2000);
  }, `email to ${to}`);
  const full = await (await fetch(`${MAIL}/message/${msg.ID}`)).json();
  const href = (full.HTML || "").match(/href="([^"]*verify[^"]*)"/)?.[1] ?? (full.Text || "").match(/https?:\/\/\S*verify\S*/)?.[0];
  return { subject: msg.Subject, link: href.replace(/&amp;/g, "&") };
}

async function newPage(browser, device = "iPhone 13") {
  const page = await (await browser.newContext(devices[device])).newPage();
  page.on("dialog", (d) => d.accept());
  return page;
}
async function signIn(browser, email, password, device) {
  const page = await newPage(browser, device);
  await page.goto(BASE + "/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button:has-text('Sign in')");
  return page;
}
async function setPassword(page, password) {
  await page.getByRole("button", { name: "Save password and continue" }).waitFor();
  await page.fill("#new-password", password);
  await page.fill("#confirm-password", password);
  await page.getByRole("button", { name: "Save password and continue" }).click();
}
const nav = async (page) => (await page.getByRole("navigation", { name: "Admin" }).getByRole("link").allTextContents()).map((s) => s.trim());

(async () => {
  for (const p of [BEA, RICO, MARA]) sql(`update riders set user_id = null where user_id in (select id from auth.users where email = '${p.email}'); delete from auth.users where email = '${p.email}'`);
  sql("delete from auth.users where email like '%@t.test'; delete from riders where name in ('Rico Rider', 'Rico') and id not in (select rider_id from orders where rider_id is not null);");
  sql("update store_settings set is_open = true, open_time = '00:00', close_time = '23:59'");
  await fetch(`${MAIL}/messages`, { method: "DELETE" });
  const browser = await chromium.launch();

  // ---------- admin: Team section ----------
  const admin = await signIn(browser, "admin@pahuway.cafe", "ChangeMe-Admin-2026", "iPad (gen 7) landscape");
  await admin.waitForURL(BASE + "/admin");
  await admin.goto(BASE + "/admin/settings");
  const team = admin.locator("section", { has: admin.getByRole("heading", { name: "Team" }) });
  await team.getByRole("form", { name: "Invite someone" }).waitFor();
  assert((await admin.getByRole("heading", { name: "Riders", exact: true }).count()) === 0, "Team replaces the old Riders section in Settings");
  const meRow = team.getByTestId("team-row").filter({ hasText: "You" });
  assert((await meRow.getByRole("button").count()) === 0, "your own row has no actions (can't lock yourself out)");

  const invite = team.getByRole("form", { name: "Invite someone" });
  await invite.getByRole("checkbox", { name: /Orders board/ }).uncheck();
  await invite.getByRole("checkbox", { name: /Sold-out switches/ }).uncheck();
  await invite.locator("#invite-name").fill(BEA.name);
  await invite.locator("#invite-email").fill(BEA.email);
  await invite.getByRole("button", { name: "Send invite" }).click();
  await team.getByText("Tick at least one thing they can do.").waitFor();
  assert(true, "staff need at least one permission");

  // ---------- invite by email: staff with the Barista preset ----------
  await invite.getByRole("button", { name: "Barista preset" }).click();
  const t0 = Date.now();
  await invite.getByRole("button", { name: "Send invite" }).click();
  await team.getByText(`Invite sent to ${BEA.email}`).waitFor();
  const beaRow = team.getByTestId("team-row").filter({ hasText: BEA.name });
  await beaRow.getByText("Invited").waitFor();
  assert(sql(`select role||'|'||array_to_string(permissions, ',')||'|'||is_active from users where email='${BEA.email}'`) === "staff|orders,stock,open_close|true", "invited as Staff with the ticked permissions (Barista preset)");
  assert((await beaRow.getByText("Open / close the store").count()) === 1, "team list shows what they can do");
  await team.screenshot({ path: path.join(__dirname, "../docs/screenshots/26-settings-team.png") });

  const mail1 = await mailLink(BEA.email, t0);
  assert(/invit/i.test(mail1.subject), `invite email arrived ("${mail1.subject}")`);
  const bea = await newPage(browser, "iPad (gen 7) landscape");
  await bea.goto(mail1.link);
  await bea.getByRole("heading", { name: "Welcome, Bea!" }).waitFor();
  assert(!bea.url().includes("token") && !bea.url().includes("#"), "invite link opens /welcome and the one-time token is removed from the address bar");
  await bea.fill("#new-password", "kape-isla-2026");
  await bea.fill("#confirm-password", "kape-isla-2027");
  await bea.getByRole("button", { name: "Save password and continue" }).click();
  await bea.getByText("The two passwords don't match.").waitFor();
  await setPassword(bea, "kape-isla-2026");
  await bea.waitForURL(BASE + "/admin");
  assert(JSON.stringify(await nav(bea)) === JSON.stringify(["Orders", "Sold out"]), "after setting a password she lands on the board with only her pages (Orders, Sold out)");
  const sw = bea.getByRole("switch", { name: "Store open for orders" });
  await sw.click();
  await until(() => sql("select is_open from store_settings") === "f", "store closed by staff");
  await bea.getByRole("switch", { name: "Store open for orders" }).click();
  await until(() => sql("select is_open from store_settings") === "t", "store reopened");
  assert(true, "open/close permission: she can switch the store");
  await bea.goto(BASE + "/admin/settings");
  await bea.waitForURL(/\/admin\?not_allowed=1/);
  const denied = await bea.evaluate(async () => [(await fetch("/api/admin/team")).status, (await fetch("/api/payments/refund", { method: "POST", body: "{}" })).status]);
  assert(denied.every((s) => s === 403), "pages and APIs outside her permissions are refused (settings, team, refunds)");
  await admin.waitForTimeout(300);
  await admin.reload();
  await beaRow.getByText("Invited").waitFor({ state: "detached" });
  assert(true, "her status changes from Invited once she has set a password");

  // ---------- edit permissions ----------
  await beaRow.getByRole("button", { name: "Edit" }).click();
  const edit = team.getByRole("form", { name: `Edit ${BEA.name}` });
  await edit.getByRole("checkbox", { name: /Menu & options/ }).check();
  await edit.getByRole("checkbox", { name: /Orders board/ }).uncheck();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await team.getByText(`${BEA.name} is updated.`).waitFor();
  await bea.goto(BASE + "/admin");
  await bea.waitForURL(/\/admin\/stock\?not_allowed=1/);
  assert((await nav(bea)).includes("Menu") && !(await nav(bea)).includes("Orders"), "permission changes apply on her next page (Menu added, Orders removed → lands on Sold out)");

  // ---------- invite a rider by link (no email) ----------
  await invite.getByRole("radio", { name: /Rider/ }).check({ force: true });
  await invite.locator("#invite-name").fill(RICO.name);
  await invite.locator("#invite-email").fill(RICO.email);
  await invite.getByRole("button", { name: "Create invite link" }).waitFor({ state: "detached" }).catch(() => {});
  await invite.getByRole("checkbox", { name: /Email the invite/ }).uncheck();
  await invite.getByRole("button", { name: "Create invite link" }).click();
  await team.getByText("Riders need a mobile number").waitFor();
  await invite.locator("#invite-phone").fill(RICO.phone);
  await invite.getByRole("button", { name: "Create invite link" }).click();
  const linkBox = team.getByTestId("invite-link").first();
  await linkBox.waitFor();
  const riderLink = await linkBox.getByRole("textbox", { name: "Invite link" }).inputValue();
  assert(riderLink.startsWith(BASE + "/welcome?token_hash="), "no-email invite gives a link to share by Messenger/SMS");
  assert(sql(`select count(*) from riders r join users u on u.id = r.user_id where u.email='${RICO.email}' and r.is_active and r.phone='${RICO.phone}'`) === "1", "rider record created (shows in the assign-rider list)");
  const rico = await newPage(browser);
  await rico.goto(riderLink);
  await rico.getByRole("heading", { name: "Welcome, Rico!" }).waitFor();
  await setPassword(rico, "rider-pass-2026");
  await rico.waitForURL(BASE + "/rider");
  assert(true, "rider sets a password from the link and lands on their deliveries");
  const reused = await newPage(browser);
  await reused.goto(riderLink);
  await reused.getByText("This link has expired or was already used").waitFor();
  assert(true, "an invite link works only once");

  // ---------- full admin ----------
  await invite.getByRole("radio", { name: /Full admin/ }).check({ force: true });
  await invite.locator("#invite-name").fill(MARA.name);
  await invite.locator("#invite-email").fill(MARA.email);
  await invite.getByRole("button", { name: "Create invite link" }).click();
  await team.getByText(`${MARA.name} is added`).waitFor();
  const maraLink = await team.getByTestId("invite-link").first().getByRole("textbox").inputValue();
  const mara = await newPage(browser, "iPad (gen 7) landscape");
  await mara.goto(maraLink);
  await setPassword(mara, "manager-pass-2026");
  await mara.waitForURL(BASE + "/admin");
  await mara.goto(BASE + "/admin/settings");
  await mara.getByRole("heading", { name: "Team" }).waitFor();
  assert((await nav(mara)).length === 7, "Full admin sees every page, including Team");

  // ---------- password reset: link and email ----------
  await beaRow.getByRole("button", { name: "Copy password-reset link" }).click();
  const resetLink = await beaRow.getByTestId("invite-link").getByRole("textbox").inputValue();
  const beaReset = await newPage(browser);
  await beaReset.goto(resetLink);
  await setPassword(beaReset, "new-kape-2026");
  await beaReset.waitForURL(/\/admin\/stock/);
  const oldPw = await signIn(browser, BEA.email, "kape-isla-2026");
  await oldPw.getByText("Wrong email or password.").waitFor();
  assert(true, "password-reset link: she sets a new password, the old one stops working");
  const t1 = Date.now();
  await beaRow.getByRole("button", { name: "Email password reset" }).click();
  await team.getByText(`Email sent to ${BEA.email}`).waitFor();
  const mail2 = await mailLink(BEA.email, t1);
  const beaMail = await newPage(browser);
  await beaMail.goto(mail2.link);
  await setPassword(beaMail, "emailed-kape-2026");
  await beaMail.waitForURL(/\/admin\/stock/);
  assert(true, `password-reset email works too ("${mail2.subject}")`);

  // ---------- switch off / on ----------
  await beaRow.getByRole("button", { name: "Switch off" }).click();
  await beaRow.getByText("Switched off").waitFor();
  await beaMail.goto(BASE + "/admin/stock");
  await beaMail.waitForURL(/\/login\?/);
  const blocked = await signIn(browser, BEA.email, "emailed-kape-2026");
  await blocked.getByText("This login has been switched off").waitFor();
  assert(true, "switched-off login: locked out of an open session and can't sign in");
  assert((await beaRow.getByRole("button", { name: "Email password reset" }).count()) === 0, "no reset links for a switched-off login");
  await beaRow.getByRole("button", { name: "Switch back on" }).click();
  await beaRow.getByText("Switched off").waitFor({ state: "detached" });
  const back = await signIn(browser, BEA.email, "emailed-kape-2026");
  await back.waitForURL(/\/admin\/stock/);
  assert(true, "switched back on → can sign in again");

  // ---------- safety ----------
  const myId = sql("select id from users where email='admin@pahuway.cafe'");
  const self = await admin.evaluate(async (id) => {
    const j = (b) => ({ method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    return [
      (await fetch(`/api/admin/team/${id}`, j({ kind: "staff", permissions: ["orders"] }))).status,
      (await fetch(`/api/admin/team/${id}`, j({ active: false }))).status,
      (await fetch(`/api/admin/team/${id}`, { method: "DELETE" })).status,
    ];
  }, myId);
  assert(self.every((s) => s === 400), "admins can't demote, switch off or delete themselves");
  const custId = sql("insert into auth.users (id, email) values (gen_random_uuid(), 'shopper@example.com') returning id").split("\n")[0];
  const cust = await admin.evaluate(async (id) => (await fetch(`/api/admin/team/${id}`, { method: "DELETE" })).status, custId);
  assert(cust === 404 && sql(`select count(*) from users where id='${custId}'`) === "1", "the team API can't touch customer accounts");
  sql(`delete from auth.users where id='${custId}'`);

  // ---------- delete a rider: login gone, delivery history kept ----------
  const riderId = sql(`select r.id from riders r join users u on u.id = r.user_id where u.email='${RICO.email}'`);
  const tok = JSON.parse(sql(`set role anon; select place_order('{"customer_name":"Wendy","customer_phone":"09171112233","order_type":"pickup","payment_method":"cash"}', '[{"menu_item_id":"30000000-0000-0000-0000-000000000013","quantity":1}]')`).split("\n").pop()).token;
  sql(`update orders set rider_id='${riderId}' where public_token='${tok}'`);
  const ricoRow = team.getByTestId("team-row").filter({ hasText: RICO.name });
  await ricoRow.getByRole("button", { name: "Delete login" }).click();
  await team.getByText(`${RICO.name}'s login was deleted.`).waitFor();
  assert(sql(`select count(*) from auth.users where email='${RICO.email}'`) === "0", "delete removes the login");
  assert(sql(`select r.name||'|'||r.is_active from orders o join riders r on r.id = o.rider_id where o.public_token='${tok}'`) === "Rico Rider|false", "…their past deliveries keep the rider's name; they're off the assign list");

  await browser.close();
  sql(`delete from order_items where order_id in (select id from orders where public_token='${tok}'); delete from orders where public_token='${tok}'; delete from riders where id='${riderId}';`);
  for (const p of [BEA, MARA]) sql(`delete from auth.users where email = '${p.email}'`);
  console.log("\nAll team checks passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
