// Staff logins: admin adds staff (Orders only / Full admin), staff see only the board + Sold out,
// change access, reset password, switch off / on, delete. Safety rules on the API.
// Needs local Supabase (migrations + seed) + seed:users + app on :3000.  Run: npm run test:staff
const { chromium, devices } = require("playwright");
const { execFileSync } = require("child_process");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const sql = (q) => execFileSync("docker", ["exec", "-i", "supabase_db_pahuway-cafe", "psql", "-U", "postgres", "-Atc", q]).toString().trim();
const assert = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("ok", m);
};
const BARISTA = { name: "Bea Barista", email: "bea.barista@example.com" };

async function signIn(browser, email, password, device = "iPad (gen 7) landscape") {
  const page = await (await browser.newContext(devices[device])).newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE + "/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button:has-text('Sign in')");
  return page;
}
const nav = async (page) => (await page.getByRole("navigation", { name: "Admin" }).getByRole("link").allTextContents()).map((s) => s.trim());

(async () => {
  sql(`delete from auth.users where email = '${BARISTA.email}' or email like '%@t.test'`);
  sql("update store_settings set is_open = true, open_time = '00:00', close_time = '23:59'");
  const browser = await chromium.launch();

  // ---------- admin: Staff page ----------
  const admin = await signIn(browser, "admin@pahuway.cafe", "ChangeMe-Admin-2026");
  await admin.waitForURL(BASE + "/admin");
  assert((await nav(admin)).includes("Staff") && (await nav(admin)).includes("Sold out"), "admin nav has Staff and Sold out");
  await admin.getByRole("link", { name: "Staff", exact: true }).click();
  await admin.getByRole("heading", { name: "Add staff" }).waitFor();
  const meRow = admin.getByTestId("staff-row").filter({ hasText: "You" });
  assert((await meRow.locator("select").isDisabled()) && (await meRow.getByRole("button").count()) === 0, "your own row: access locked, no switch-off/delete");

  await admin.getByRole("button", { name: "Create staff login" }).click();
  await admin.getByText("Enter the staff member's name.").waitFor();
  assert(true, "form validation: name required");

  await admin.fill("#staff-name", BARISTA.name);
  await admin.fill("#staff-phone", "0917 555 1234");
  await admin.fill("#staff-email", BARISTA.email);
  await admin.getByRole("button", { name: "Suggest" }).click();
  const pw1 = await admin.inputValue("#staff-password");
  assert(pw1.length >= 8, `"Suggest" fills a strong password (${pw1})`);
  assert(await admin.getByRole("radio", { name: /Orders only/ }).isChecked(), "Orders only is the default access");
  await admin.getByRole("button", { name: "Create staff login" }).click();
  await admin.getByText(`${BARISTA.name} can now sign in`).waitFor();
  const row = admin.getByTestId("staff-row").filter({ hasText: BARISTA.name });
  await row.waitFor();
  await admin.screenshot({ path: path.join(__dirname, "../docs/screenshots/26-admin-staff.png"), fullPage: true });
  assert(sql(`select role||'|'||is_active||'|'||phone from users where email='${BARISTA.email}'`) === "staff|true|09175551234", "staff login created as Orders only, active, phone saved");

  await admin.fill("#staff-name", "Dup");
  await admin.fill("#staff-email", BARISTA.email);
  await admin.fill("#staff-password", "something-long");
  await admin.getByRole("button", { name: "Create staff login" }).click();
  await admin.getByText("That email already has a login").waitFor();
  assert(true, "duplicate email refused with a clear message");

  // ---------- staff: orders only ----------
  const bea = await signIn(browser, BARISTA.email, pw1);
  await bea.waitForURL(BASE + "/admin");
  assert(JSON.stringify(await nav(bea)) === JSON.stringify(["Orders", "Sold out"]), "staff nav shows only Orders and Sold out");
  assert((await bea.getByRole("switch", { name: "Store open for orders" }).count()) === 0, "staff can't open/close the store (status shown only)");
  for (const p of ["menu", "options", "zones", "summary", "settings", "staff"]) {
    await bea.goto(`${BASE}/admin/${p}`);
    await bea.waitForURL(/\/admin\?admin_only=1/);
  }
  assert(true, "admin-only pages send staff back to the orders board");
  const apiStatus = await bea.evaluate(async () => [
    (await fetch("/api/admin/staff")).status,
    (await fetch("/api/admin/riders", { method: "POST", body: "{}" })).status,
    (await fetch("/api/payments/refund", { method: "POST", body: "{}" })).status,
  ]);
  assert(apiStatus.every((s) => s === 403), `staff API calls refused (staff list, add rider, refund: ${apiStatus.join(",")})`);

  // order shows up on the board and staff can accept it
  const token = JSON.parse(
    sql(`set role anon; select place_order('{"customer_name":"Walk-in Wendy","customer_phone":"09171112233","order_type":"pickup","payment_method":"cash"}', '[{"menu_item_id":"30000000-0000-0000-0000-000000000013","quantity":1}]')`).split("\n").pop(),
  ).token;
  await bea.goto(BASE + "/admin");
  await bea.getByText("Walk-in Wendy").first().click();
  await bea.getByRole("button", { name: /^Accept/ }).click();
  await bea.waitForFunction(() => true);
  for (let i = 0; i < 20 && sql(`select status from orders where public_token='${token}'`) !== "preparing"; i++) await bea.waitForTimeout(250);
  assert(sql(`select status from orders where public_token='${token}'`) === "preparing", "staff can accept orders on the board");
  await bea.keyboard.press("Escape");

  // Sold out page
  await bea.goto(BASE + "/admin/stock");
  const americano = bea.getByRole("switch", { name: "Americano available" });
  await americano.click();
  for (let i = 0; i < 20 && sql("select is_sold_out from menu_items where name='Americano'") !== "t"; i++) await bea.waitForTimeout(250);
  assert(sql("select is_sold_out from menu_items where name='Americano'") === "t", "staff mark an item sold out from the Sold out page");
  await bea.getByRole("switch", { name: "Americano available" }).click();
  for (let i = 0; i < 20 && sql("select is_sold_out from menu_items where name='Americano'") !== "f"; i++) await bea.waitForTimeout(250);
  const oat = bea.getByRole("switch", { name: /Oat milk available/ }).first();
  await oat.click();
  for (let i = 0; i < 20 && sql("select bool_and(is_active) from item_options where name='Oat milk'") !== "f"; i++) await bea.waitForTimeout(250);
  assert(sql("select bool_and(is_active) from item_options where name='Oat milk'") === "f", "staff switch an option off (oat milk)");
  await bea.getByRole("switch", { name: /Oat milk available/ }).first().click();
  for (let i = 0; i < 20 && sql("select bool_and(is_active) from item_options where name='Oat milk'") !== "t"; i++) await bea.waitForTimeout(250);
  await bea.evaluate(() => window.scrollTo(0, 0));
  await bea.waitForTimeout(400);
  await bea.screenshot({ path: path.join(__dirname, "../docs/screenshots/27-staff-sold-out.png") });

  // ---------- admin changes access ----------
  await row.locator("select").selectOption("admin");
  await admin.getByText(`${BARISTA.name} now has Full admin access.`).waitFor();
  await bea.goto(BASE + "/admin");
  await bea.getByRole("link", { name: "Menu", exact: true }).waitFor();
  assert((await nav(bea)).includes("Settings"), "promoted to Full admin → full menu appears");
  await row.locator("select").selectOption("staff");
  await admin.getByText(`${BARISTA.name} now has Orders only access.`).waitFor();
  await bea.goto(BASE + "/admin/settings");
  await bea.waitForURL(/admin_only=1/);
  assert(true, "back to Orders only → settings blocked again");

  // ---------- reset password ----------
  await row.getByRole("button", { name: "Reset password" }).click();
  const pw2 = "new-pass-2026";
  await row.getByLabel(`New password for ${BARISTA.name}`).fill(pw2);
  await row.getByRole("button", { name: "Set password", exact: true }).click();
  await admin.getByText(`New password for ${BARISTA.name}: ${pw2}`).waitFor();
  const old = await signIn(browser, BARISTA.email, pw1, "iPhone 13");
  await old.getByText("Wrong email or password.").waitFor();
  const fresh = await signIn(browser, BARISTA.email, pw2, "iPhone 13");
  await fresh.waitForURL(BASE + "/admin");
  assert(true, "reset password: old one stops working, new one signs in");

  // ---------- switch off / on ----------
  await row.getByRole("button", { name: "Switch off login" }).click();
  await row.getByText("Switched off").waitFor();
  await bea.goto(BASE + "/admin");
  await bea.waitForURL(/\/login\?(denied=1|next=)/);
  assert(true, "switched-off staff are locked out of an already-open session");
  const blocked = await signIn(browser, BARISTA.email, pw2, "iPhone 13");
  await blocked.getByText("This login has been switched off").waitFor();
  assert(sql(`select is_active from users where email='${BARISTA.email}'`) === "f", "…and can't sign in again (friendly message)");
  await row.getByRole("button", { name: "Switch login back on" }).click();
  await row.getByRole("button", { name: "Switch off login" }).waitFor();
  const back = await signIn(browser, BARISTA.email, pw2, "iPhone 13");
  await back.waitForURL(BASE + "/admin");
  assert(true, "switched back on → can sign in again");

  // ---------- safety rules ----------
  const myId = sql("select id from users where email='admin@pahuway.cafe'");
  const safety = await admin.evaluate(async (id) => {
    const r1 = await fetch(`/api/admin/staff/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access: "staff" }) });
    const r2 = await fetch(`/api/admin/staff/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) });
    const r3 = await fetch(`/api/admin/staff/${id}`, { method: "DELETE" });
    return [r1.status, r2.status, r3.status];
  }, myId);
  assert(safety.every((s) => s === 400) && sql(`select role::text||is_active::text from users where id='${myId}'`) === "admintrue", "an admin can't demote, switch off or delete themselves");
  const custId = sql("insert into auth.users (id, email) values (gen_random_uuid(), 'shopper@example.com') returning id").split("\n")[0];
  const notStaff = await admin.evaluate(async (id) => (await fetch(`/api/admin/staff/${id}`, { method: "DELETE" })).status, custId);
  assert(notStaff === 404 && sql(`select count(*) from users where id='${custId}'`) === "1", "staff API can't touch customer accounts");
  sql(`delete from auth.users where id='${custId}'`);

  // ---------- delete ----------
  await row.getByRole("button", { name: "Delete login" }).click();
  await admin.getByText(`${BARISTA.name}'s login was deleted.`).waitFor();
  assert(sql(`select count(*) from auth.users where email='${BARISTA.email}'`) === "0" && (await admin.getByTestId("staff-row").filter({ hasText: BARISTA.name }).count()) === 0, "delete removes the login completely");
  assert(sql(`select status from orders where public_token='${token}'`) === "preparing", "orders they handled are kept");

  await browser.close();
  sql(`delete from order_items where order_id in (select id from orders where public_token='${token}'); delete from orders where public_token='${token}';`);
  console.log("\nAll staff checks passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
