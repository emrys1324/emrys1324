// Admin changes the logo and background; customers see it live; staff screens stay plain.
// Needs local Supabase (migrations applied) + seed:users + app on :3000.
// Run: node tests/branding.test.js
const { chromium, devices } = require("playwright");
const path = require("path");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const F = (n) => path.join(__dirname, "fixtures", n);
const SHOTS = path.join(__dirname, "../docs/screenshots/");
const assert = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("ok", m);
};

(async () => {
  const browser = await chromium.launch();
  const admin = await (await browser.newContext({ ...devices["iPad (gen 7) landscape"] })).newPage();
  const cust = await (await browser.newContext({ ...devices["iPhone 13"] })).newPage();

  // customer has the menu open before any change
  await cust.goto(BASE + "/");
  await cust.getByRole("heading", { name: "Coffee", exact: true }).waitFor();
  assert((await cust.locator("header img").first().getAttribute("src")) === "/logo.svg", "default logo shown initially");
  assert((await cust.getByTestId("brand-background").count()) === 0, "no background initially");

  await admin.goto(BASE + "/login");
  await admin.fill("#email", "admin@pahuway.cafe");
  await admin.fill("#password", "ChangeMe-Admin-2026");
  await admin.click("button:has-text('Sign in')");
  await admin.waitForURL(BASE + "/admin");
  await admin.goto(BASE + "/admin/settings");
  await admin.getByRole("heading", { name: "Branding" }).waitFor();

  // validation: tiny logo refused
  await admin.setInputFiles("input[aria-label='Upload logo']", F("test-logo-small.png"));
  await admin.getByText("Logo is too small").waitFor();
  assert(true, "too-small logo rejected with a friendly message");

  // upload logo + background, set fade, save
  await admin.setInputFiles("input[aria-label='Upload logo']", F("test-logo.png"));
  await admin.getByText("Logo uploaded").waitFor();
  const logoSrc = await admin.getByTestId("logo-preview").getAttribute("src");
  assert(logoSrc.includes("/storage/v1/object/public/menu-photos/branding/"), "logo stored in public branding folder");
  await admin.setInputFiles("input[aria-label='Upload background']", F("test-background.png"));
  await admin.getByText("Background uploaded").waitFor();
  await admin.locator("#fade").fill("70");
  await admin.getByTestId("background-preview").scrollIntoViewIfNeeded();
  await admin.screenshot({ path: SHOTS + "13-admin-branding.png" });
  await admin.getByRole("button", { name: "Save settings" }).click();
  await admin.getByText("Settings saved.").waitFor();
  await admin.waitForFunction((src) => document.querySelector("header img")?.getAttribute("src") === src, logoSrc, { timeout: 5000 });
  assert(true, "staff header shows the new logo after saving");

  // customer page updates live (no reload)
  await cust.waitForFunction((src) => document.querySelector("header img")?.getAttribute("src") === src, logoSrc, { timeout: 8000 });
  assert(true, "customer header logo changed live without reload");
  await cust.getByTestId("brand-background").waitFor({ timeout: 8000 });
  const overlay = await cust.getByTestId("brand-background").locator("div").evaluate((el) => getComputedStyle(el).opacity);
  assert(Math.abs(Number(overlay) - 0.7) < 0.01, "background appears live with the chosen 70% fade");
  await cust.screenshot({ path: SHOTS + "14-menu-with-branding.png" });

  // reload persists; staff screens stay plain
  await cust.reload();
  await cust.getByTestId("brand-background").waitFor();
  assert(true, "branding persists after reload");
  assert((await admin.getByTestId("brand-background").count()) === 0, "no background on staff screens");
  await cust.goto(BASE + "/login");
  await cust.locator("img").first().waitFor();
  assert((await cust.getByTestId("brand-background").count()) === 0 && (await cust.locator("main img").first().getAttribute("src")) === logoSrc, "login page: new logo, no background");

  // revert to defaults
  await admin.getByRole("button", { name: "Use default logo" }).click();
  await admin.getByRole("button", { name: "Remove background" }).click();
  await admin.getByRole("button", { name: "Save settings" }).click();
  await admin.getByText("Settings saved.").waitFor();
  await cust.goto(BASE + "/");
  await cust.getByRole("heading", { name: "Coffee", exact: true }).waitFor();
  assert((await cust.locator("header img").first().getAttribute("src")) === "/logo.svg" && (await cust.getByTestId("brand-background").count()) === 0, "defaults restored");

  await browser.close();
  console.log("\nALL BRANDING TESTS PASSED");
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
