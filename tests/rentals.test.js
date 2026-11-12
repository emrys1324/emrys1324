// Baybayin scooter rentals end to end: admin adds scooters and opens bookings; customers book by the day,
// upload a license, pay the deposit on (mock) HitPay; double-booking is blocked; staff run pickup/return,
// cancel + refund; unpaid bookings can resume payment; switching bookings off shows Coming soon again.
// Start the app with:  HITPAY_API_KEY=hp_e2e HITPAY_SALT=salt_e2e HITPAY_API_BASE=http://127.0.0.1:4010 npx next start -p 3000
// Run: npm run test:rentals
const { chromium, devices } = require("playwright");
const { execFileSync } = require("child_process");
const path = require("path");
const { startMockHitpay } = require("./mock-hitpay");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const F = (n) => path.join(__dirname, "fixtures", n);
const sql = (q) => execFileSync("docker", ["exec", "-i", "supabase_db_pahuway-cafe", "psql", "-U", "postgres", "-Atc", q]).toString().trim();
const assert = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("ok", m);
};
const ymd = (offset) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86400000));
const until = async (fn, what, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("FAIL: timed out waiting for " + what);
};

async function book(page, { scooter, start, end, name, phone, delivery, helmets = 1 }) {
  await page.goto(BASE + "/baybayin");
  await page.getByRole("heading", { name: "Rent a scooter" }).waitFor();
  await page.locator("#pickup-date").fill(start);
  await page.locator("#return-date").fill(end);
  await page.getByRole("radio", { name: scooter, exact: true }).click();
  await page.locator("#renter-name").fill(name);
  await page.locator("#renter-phone").fill(phone);
  await page.getByRole("radio", { name: helmets === 2 ? "2 (+ passenger)" : helmets === 1 ? "1 (rider)" : "None" }).click();
  if (delivery) {
    await page.getByLabel(/Deliver the scooter to my place/).check();
    await page.locator("#delivery-address").fill(delivery);
  }
  await page.setInputFiles("input[aria-label=\"Driver's license photo\"]", F("test-background.png"));
}

(async () => {
  sql("delete from rental_bookings; delete from scooters; update rental_settings set bookings_enabled = false, deposit_percent = 30, security_deposit = 0, security_deposit_note = null, delivery_fee = 0, pickup_note = null, max_days = 30;");
  const mock = await startMockHitpay({ port: 4010, salt: "salt_e2e", apiKey: "hp_e2e" });
  const browser = await chromium.launch();
  const phone = devices["iPhone 13"];

  // ---------- bookings off → Coming soon ----------
  const cust = await (await browser.newContext(phone)).newPage();
  await cust.goto(BASE + "/baybayin");
  await cust.getByText("Coming soon").first().waitFor();
  assert((await cust.getByRole("heading", { name: "Rent a scooter" }).count()) === 0, "with bookings off, the Baybayin page shows Coming soon");

  // ---------- admin: scooters + settings ----------
  const admin = await (await browser.newContext(devices["iPad (gen 7) landscape"])).newPage();
  admin.on("dialog", (d) => d.accept());
  await admin.goto(BASE + "/login");
  await admin.fill("#email", "admin@pahuway.cafe");
  await admin.fill("#password", "ChangeMe-Admin-2026");
  await admin.click("button:has-text('Sign in')");
  await admin.waitForURL(BASE + "/admin");
  await admin.getByRole("link", { name: "Rentals", exact: true }).click();
  await admin.getByRole("heading", { name: "Baybayin rentals" }).waitFor();
  await admin.getByRole("tab", { name: "scooters" }).click();
  for (const [n, rate, desc] of [["Honda Click 125", "500", "Automatic · good for 2"], ["Yamaha Mio", "400", "Light and easy"]]) {
    await admin.getByRole("button", { name: "+ Add scooter" }).click();
    await admin.locator("#scooter-name").fill(n);
    await admin.locator("#scooter-desc").fill(desc);
    await admin.locator("#scooter-rate").fill(rate);
    if (n === "Honda Click 125") {
      await admin.setInputFiles("input[aria-label='Scooter photo']", F("test-logo.png"));
      await admin.getByRole("dialog").getByText("Change photo").waitFor();
    }
    await admin.getByRole("button", { name: "Save scooter" }).click();
    await admin.getByText(`${n} saved.`).waitFor();
  }
  assert((await admin.getByTestId("scooter-row").count()) === 2 && sql("select photo_url like '%/menu-photos/scooters/%' from scooters where name='Honda Click 125'") === "t", "admin adds scooters with daily rates and a photo");
  await admin.getByRole("tab", { name: "settings" }).click();
  await admin.locator("#deposit-percent").fill("30");
  await admin.locator("#delivery-fee").fill("150");
  await admin.locator("#security-deposit").fill("2000");
  await admin.locator("#security-note").fill("or leave a valid ID");
  await admin.locator("#pickup-note").fill("At Pahuway Cafe, Poblacion — 8 AM to 6 PM");
  await admin.getByRole("switch", { name: "Accept bookings" }).click();
  await admin.getByRole("button", { name: "Save rental settings" }).click();
  await admin.getByText("Rental settings saved.").waitFor();
  assert(sql("select bookings_enabled::text || deposit_percent || '|' || delivery_fee from rental_settings") === "true30|150.00", "admin opens bookings and sets deposit %, delivery fee, security deposit, pickup note");

  // ---------- customer books ----------
  const s1 = ymd(2), e1 = ymd(4);
  await cust.goto(BASE + "/baybayin");
  await cust.getByRole("heading", { name: "Rent a scooter" }).waitFor();
  assert(true, "with bookings on, the Baybayin page becomes the booking page");
  await cust.getByRole("button", { name: /deposit|Book a scooter/ }).click();
  await cust.getByText("Choose a scooter.").waitFor();
  await cust.getByText("Please add a photo of your driver's license.").waitFor();
  assert(true, "form checks: scooter, name, mobile and license photo required");
  await book(cust, { scooter: "Honda Click 125", start: s1, end: e1, name: "Ana Reyes", phone: "0917 111 2222", helmets: 2, delivery: "Kamandag Beach Resort, Poblacion" });
  await cust.getByTestId("rental-days").getByText("2 days").waitFor();
  const summary = await cust.getByTestId("rental-summary").textContent();
  assert(summary.includes("₱1,150") && summary.includes("₱345") && summary.includes("₱805"), "summary: 2 days × ₱500 + ₱150 delivery = ₱1,150; 30% deposit ₱345; ₱805 at pickup");
  assert((await cust.getByTestId("security-deposit").textContent()).includes("₱2,000"), "security deposit notice shown");
  await cust.getByRole("button", { name: "Pay ₱345 deposit" }).click();
  await cust.waitForURL(/127\.0\.0\.1:4010\/checkout\/pr_\d+/);
  assert((await cust.locator("#amount").textContent()) === "PHP 345.00" && /^BY-\d{4}$/.test(await cust.locator("#ref").textContent()), "customer goes to HitPay for exactly the ₱345 deposit (reference BY-####)");
  const bookingNo = await cust.locator("#ref").textContent();
  assert(sql(`select status||'|'||payment_status from rental_bookings where booking_number='${bookingNo}'`) === "awaiting_deposit|awaiting_payment", "booking held while the deposit is unpaid");
  await cust.getByRole("button", { name: "Pay with GCash" }).click();
  await cust.waitForURL(/\/baybayin\/booking\/[0-9a-f-]{36}\?paid=1/);
  await cust.getByText("You're booked! Deposit received ✓").waitFor({ timeout: 15000 });
  assert(sql(`select status||'|'||payment_status from rental_bookings where booking_number='${bookingNo}'`) === "confirmed|deposit_paid", "after paying: booking confirmed, deposit paid");
  assert((await cust.getByTestId("balance").textContent()) === "₱805", "booking page shows the balance due at pickup");

  // ---------- no double booking ----------
  const cust2 = await (await browser.newContext(phone)).newPage();
  await cust2.goto(BASE + "/baybayin");
  await cust2.locator("#pickup-date").fill(ymd(3));
  await cust2.locator("#return-date").fill(ymd(5));
  await until(async () => (await cust2.getByRole("radio", { name: "Honda Click 125 (booked)" }).count()) === 1, "Honda shown as booked");
  assert(await cust2.getByRole("radio", { name: "Honda Click 125 (booked)" }).isDisabled(), "overlapping dates: the booked scooter can't be chosen");
  await cust2.locator("#pickup-date").fill(e1);
  await cust2.locator("#return-date").fill(ymd(6));
  await until(async () => (await cust2.getByRole("radio", { name: "Honda Click 125", exact: true }).count()) === 1, "Honda free from its return day");
  assert(true, "the scooter is free again from its return day");

  // ---------- second booking: Yamaha, then cancel + refund ----------
  await book(cust2, { scooter: "Yamaha Mio", start: ymd(10), end: ymd(10), name: "Ben Cruz", phone: "09181234567" });
  await cust2.getByTestId("rental-days").getByText("1 day").waitFor();
  await cust2.getByRole("button", { name: "Pay ₱120 deposit" }).click();
  await cust2.waitForURL(/127\.0\.0\.1:4010\/checkout/);
  const no2 = await cust2.locator("#ref").textContent();
  await cust2.getByRole("button", { name: "Pay with GCash" }).click();
  await cust2.getByText("You're booked! Deposit received ✓").waitFor({ timeout: 15000 });
  assert(true, "same-day rental = 1 day (₱400 → ₱120 deposit) booked and paid");

  // ---------- staff: bookings ----------
  await admin.getByRole("tab", { name: "bookings" }).click();
  const row = admin.getByTestId("booking-row").filter({ hasText: bookingNo });
  await row.waitFor();
  await row.click();
  const sheet = admin.getByRole("dialog");
  await sheet.getByText("Ana Reyes").waitFor();
  await until(() => sheet.getByTestId("license-photo").evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false), "license photo to load");
  assert(true, "staff see the booking with the customer's license photo (private, signed link)");
  assert((await sheet.getByTestId("collect-at-pickup").textContent()) === "₱805" && (await sheet.textContent()).includes("Kamandag Beach Resort"), "staff see what to collect at pickup and the delivery address");
  await sheet.getByRole("button", { name: "Mark picked up" }).click();
  await until(() => sql(`select status from rental_bookings where booking_number='${bookingNo}'`) === "picked_up", "picked up");
  await sheet.getByRole("button", { name: "Balance collected" }).click();
  await until(() => sql(`select payment_status from rental_bookings where booking_number='${bookingNo}'`) === "paid", "paid");
  await sheet.getByRole("button", { name: "Mark returned" }).click();
  await until(() => sql(`select status from rental_bookings where booking_number='${bookingNo}'`) === "returned", "returned");
  assert(sql(`select (picked_up_at is not null and returned_at is not null)::text from rental_bookings where booking_number='${bookingNo}'`) === "true", "pickup → balance collected → return, each time-stamped");
  await admin.keyboard.press("Escape");

  await admin.getByRole("radio", { name: "Confirmed & on the road" }).click();
  await admin.getByTestId("booking-row").filter({ hasText: no2 }).click();
  await sheet.getByRole("button", { name: "Cancel this booking…" }).click();
  await sheet.getByRole("button", { name: "Customer cancelled" }).click();
  await sheet.getByRole("button", { name: "Cancel booking" }).click();
  await sheet.getByText("Refund needed").waitFor();
  await sheet.getByRole("button", { name: "Refund ₱120 deposit" }).click();
  await until(() => sql(`select payment_status from rental_bookings where booking_number='${no2}'`) === "refunded", "refunded");
  assert(mock.refunds.some((r) => r.amount === "120.00"), "cancel + refund sends the ₱120 deposit back through HitPay");
  await cust2.reload();
  await cust2.getByText("Your deposit has been refunded.").waitFor();
  assert(true, "customer's booking page shows cancelled + refunded");

  // ---------- unpaid booking resumes payment ----------
  const cust3 = await (await browser.newContext(phone)).newPage();
  await book(cust3, { scooter: "Yamaha Mio", start: ymd(20), end: ymd(22), name: "Cara Lim", phone: "09191234567" });
  await cust3.getByRole("button", { name: "Pay ₱240 deposit" }).click();
  await cust3.waitForURL(/127\.0\.0\.1:4010\/checkout\/(pr_\d+)/);
  const pr = cust3.url().split("/").pop();
  await cust3.getByRole("link", { name: "Back to merchant" }).click();
  await cust3.getByText("Complete your deposit").waitFor({ timeout: 10000 });
  await cust3.getByRole("button", { name: "Pay ₱240 now" }).click();
  await cust3.waitForURL(new RegExp(`/checkout/${pr}$`));
  assert(true, "leaving HitPay unpaid: booking page offers Pay now, which resumes the same payment (no duplicate)");

  // ---------- switch off ----------
  await admin.keyboard.press("Escape");
  await admin.getByRole("tab", { name: "settings" }).click();
  await admin.getByRole("switch", { name: "Accept bookings" }).click();
  await admin.getByRole("button", { name: "Save rental settings" }).click();
  await admin.getByText("Rental settings saved.").waitFor();
  await cust.goto(BASE + "/baybayin");
  await cust.getByText("Coming soon").first().waitFor();
  assert(true, "switching bookings off shows Coming soon again");

  await browser.close();
  mock.server.close();
  sql("delete from rental_bookings; delete from scooters; update rental_settings set bookings_enabled = false;");
  console.log("\nAll rental checks passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
