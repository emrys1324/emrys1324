# Online payments (HitPay)

Customers can pay online with **GCash** or **QR Ph** (scan with almost any Philippine bank or e-wallet app) through **HitPay**. Cash and the manual GCash screenshot option stay available as fallbacks.

## How it works
1. At checkout the customer picks **Pay online** → **Continue to payment**.
2. The order is saved as *awaiting payment* — **hidden from the staff board** — and the customer goes to HitPay's secure payment page.
3. They pay with GCash or QR Ph and return to their order status page ("Confirming your payment…").
4. The website confirms the payment **directly with HitPay's API** — triggered by HitPay's webhook and, as a backup, by the customer's return. Then the order is marked **Paid**, appears on the staff board **with the chime**, and the customer sees "Paid online ✓".
5. Not paid within **30 minutes**? The order cancels itself (checked every 5 minutes) and never reaches the kitchen. Until then the status page shows **Complete your payment → Pay now**, which reopens the same HitPay page.

**Refunds:** if staff reject or cancel a paid online order, the order panel shows **Refund ₱… to customer** (full refund through HitPay). A payment that arrives after an order was cancelled shows a red **Refund needed** badge.

**Safety:** prices are recomputed on the server; HitPay is asked for exactly the order total; webhooks must carry a valid signature made with your **salt**; even then, the order is only marked paid after HitPay's API confirms the payment *and* the amount matches; duplicate notifications are harmless. Card/wallet details never touch this website.

## Your setup steps

### 1. Create a HitPay account
1. Sign up at https://www.hitpayapp.com (choose the Philippines).
2. Complete **business verification** so you can accept real money (business registration such as DTI/SEC, ID, and your bank account for payouts). HitPay reviews this — usually a few business days.
3. Make sure **GCash** and **QR Ph** are enabled as payment methods in your HitPay dashboard.

While waiting, you can test everything in **HitPay's sandbox**: create a sandbox account at https://dashboard.sandbox.hit-pay.com — no real money moves.

### 2. Get your API key and salt
HitPay dashboard → **Settings → Payment Gateway → API Keys**: copy the **API Key** and the **Salt**. (Sandbox and live have different keys.) Never share them in chat or email.

### 3. Add them to Vercel
Vercel → your project → **Settings → Environment Variables**, then **Redeploy**:

| Name | Value |
|---|---|
| `HITPAY_API_KEY` | your API key |
| `HITPAY_SALT` | your salt (used to check that payment notifications really come from HitPay) |
| `HITPAY_ENV` | `sandbox` while testing, `live` when you go live |
| `NEXT_PUBLIC_SITE_URL` | `https://pahuway-cafe.vercel.app` (used for the return and webhook links) |
| `HITPAY_METHODS` | optional — defaults to `gcash,qrph` |

There's no separate webhook to register: the site gives HitPay its webhook address with every payment.

### 4. Turn it on
Admin → **Settings → Online payments (HitPay)** → switch on → **Save settings**. The switch stays disabled until the keys are installed; a blue banner shows while the sandbox is active.

### 5. Test in the sandbox
Place an order with **Pay online**; on HitPay's sandbox page pay with a test method. Check: the order appears on the staff board with the chime, the customer page shows "Paid online ✓", and the payment shows in the HitPay sandbox dashboard. Try a refund too.

### 6. Go live
Swap in your **live** API key and salt, set `HITPAY_ENV=live`, redeploy, and place one small real order to confirm.

## Costs
HitPay charges a per-transaction fee (a percentage that differs per method — QR Ph is typically the cheapest) and has no monthly fee for the standard plan. Check https://www.hitpayapp.com/pricing for current Philippine rates. Payouts go to your bank account on HitPay's schedule.

## Notes & limits
- **Method names:** the site asks HitPay for `gcash` and `qrph`. If HitPay names a method differently on your account, set `HITPAY_METHODS` accordingly (e.g. add `grabpay`) — no code change needed.
- **Refunds:** HitPay may not support automatic refunds for every method. If the refund button shows an error, refund from the HitPay dashboard (or send the money back via GCash).
- **Isla mobile app:** not changed yet. In the app, HitPay's page opens in the phone's browser and the customer returns to the website there; the order still works and shows on the staff board.
- **Verified so far against a HitPay mock** that follows HitPay's documented API; please run the sandbox test (step 5) once your keys are in — I can do it with you.

## For developers
- Code: `src/lib/hitpay.ts` (Payment Requests API, status lookup, refunds, webhook HMAC for both the form `hmac` field and the JSON `Hitpay-Signature` header), `src/lib/payments.ts` (`confirmPayment`: API re-check → `mark_order_paid`), routes `src/app/api/payments/{checkout,webhook,verify,refund,status}`.
- DB: `0005_online_payments.sql` (statuses, expiry job, staff-alert rules) and `0006_payment_gateway_hitpay.sql` (provider-neutral `gateway_ref`, `gateway_payment_id`, `gateway_refund_id`, `payment_gateway`).
- Env: `HITPAY_API_KEY`, `HITPAY_SALT`, `HITPAY_ENV`, `HITPAY_METHODS`, `NEXT_PUBLIC_SITE_URL` (tests also use `HITPAY_API_BASE`).
- Tests: `npm run test:payments` (24 route checks vs. a mock HitPay), DB scenarios in `npm run test:db`, and the browser flow:
  ```bash
  HITPAY_API_KEY=hp_e2e HITPAY_SALT=salt_e2e HITPAY_API_BASE=http://127.0.0.1:4010 npx next start -p 3000
  ```
  ```bash
  npm run test:payments:e2e
  ```
