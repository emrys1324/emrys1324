// Customer sign-up with the email optional: no email → the account signs in with the mobile number.
// Start the app (npx next start -p 3000) with the local Supabase stack and run: npm run test:account
const { chromium, devices } = require("playwright");
const { execFileSync } = require("child_process");
const BASE = process.env.BASE_URL || "http://localhost:3000";
const sql = (q) => execFileSync("docker", ["exec", "-i", "supabase_db_pahuway-cafe", "psql", "-U", "postgres", "-Atc", q]).toString().trim();
const assert = (c, m) => {
  if (!c) throw new Error("FAIL: " + m);
  console.log("ok", m);
};

(async () => {
  sql("delete from auth.users where email in ('09175550101@phone.invalid', 'lea.test@example.com')");
  const browser = await chromium.launch();
  const page = await (await browser.newContext(devices["iPhone 13"])).newPage();
  const openSignup = async () => {
    await page.goto(BASE + "/account");
    await page.getByRole("button", { name: "Sign up" }).click();
    await page.locator("#su-name").waitFor();
  };

  // ---- sign up without an email
  await openSignup();
  assert((await page.locator("label[for=a-email]").textContent()).includes("(optional)"), "sign-up form marks the email as optional");
  await page.locator("#su-name").fill("Lea Santos");
  await page.locator("#su-phone").fill("0917 555 0101");
  await page.locator("#a-pass").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Password must be at least 8 characters.").waitFor();
  await page.locator("#a-email").fill("lea@nodot");
  await page.locator("#a-pass").fill("Kape-sa-umaga-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Please check your email address, or leave it empty.").waitFor();
  await page.locator("#a-email").fill("");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("heading", { name: "Hi, Lea!" }).waitFor();
  assert((await page.getByText("Signs in with 09175550101").count()) === 1, "no email: account created and signed in; profile shows it signs in with the mobile number");
  assert(sql("select (email_confirmed_at is not null)::text from auth.users where email = '09175550101@phone.invalid'") === "true", "the account is ready to use (no email confirmation needed)");
  assert(sql("select u.full_name || '|' || u.phone from public.users u join auth.users a on a.id = u.id where a.email = '09175550101@phone.invalid'") === "Lea Santos|09175550101", "name and mobile number are saved on the profile");

  // ---- sign out, sign back in with the mobile number
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(BASE + "/");
  await page.goto(BASE + "/account");
  assert((await page.locator("label[for=a-email]").textContent()).trim() === "Email or mobile number", "sign-in accepts an email or a mobile number");
  await page.locator("#a-email").fill("09175550101");
  await page.locator("#a-pass").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await page.getByText("Wrong mobile number or password.").waitFor();
  await page.locator("#a-email").fill("0917 555 0101");
  await page.locator("#a-pass").fill("Kape-sa-umaga-1");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await page.getByRole("heading", { name: "Hi, Lea!" }).waitFor();
  assert(true, "signs in with mobile number + password");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(BASE + "/");

  // ---- the same mobile number can't sign up twice
  await openSignup();
  await page.locator("#su-name").fill("Lea Again");
  await page.locator("#su-phone").fill("09175550101");
  await page.locator("#a-pass").fill("Another-pass-22");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("An account with this mobile number already exists. Please sign in instead.").waitFor();
  assert(true, "a mobile number can only have one email-less account");

  // ---- sign up with an email still works as before
  await page.locator("#su-name").fill("Lea Email");
  await page.locator("#su-phone").fill("09175550102");
  await page.locator("#a-email").fill("lea.test@example.com");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForFunction(() => /Hi, Lea!|Check your email/.test(document.body.innerText), null, { timeout: 10000 });
  assert(sql("select count(*) from auth.users where email = 'lea.test@example.com'") === "1", "signing up with an email still works as before");

  // ---- the server route refuses bad input
  const r = await fetch(BASE + "/api/account/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "X", phone: "123", password: "x" }) });
  assert(r.status === 400, "sign-up route checks name, mobile number and password");

  await browser.close();
  sql("delete from auth.users where email in ('09175550101@phone.invalid', 'lea.test@example.com')");
  console.log("\nAll account checks passed.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
