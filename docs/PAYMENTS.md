# Online payments (PayMongo)

Customers can pay online with **GCash** or **QR Ph** (scan with almost any Philippine bank or e-wallet app). Cash and the manual GCash screenshot option stay available as fallbacks.

## How it works
1. At checkout the customer picks **Pay online** → **Continue to payment**.
2. The order is saved as *awaiting payment* — **hidden from the staff board** — and the customer is sent to PayMongo's secure payment page.
3. They pay with GCash or QR Ph and return to their order status page.
4. PayMongo notifies the website (a signed *webhook*). The order is marked **Paid**, appears on the staff board **with the chime**, and the customer's page updates to "Paid online ✓".
5. Not paid within **30 minutes**? The order cancels itself (checked every 5 minutes) and never reaches the kitchen. Until then the status page shows **Complete your payment → Pay now**, which reopens the same PayMongo page.

**Refunds:** if staff reject or cancel a paid online order, the order panel shows **Refund ₱… to customer**, which refunds the full amount through PayMongo. A payment that arrives after an order was cancelled shows a red **Refund needed** badge.

**Safety:** prices are always recomputed on the server; PayMongo is asked for exactly the order total; the webhook's signature is verified (forged or replayed messages are rejected); a wrong amount is never accepted as payment; duplicate notifications are harmless. Card/wallet details never touch this website.

## Your setup steps

### 1. Create a PayMongo account (free to sign up)
1. Sign up at https://dashboard.paymongo.com/signup.
2. Complete **business verification** (needed before you can accept real money): DTI or SEC registration, a valid ID, and your bank account for payouts. PayMongo reviews this — typically a few business days.
3. In the dashboard, make sure **GCash** and **QR Ph** are enabled for your account.

You can do steps 2–5 below with **test keys** while verification is pending — no real money moves in test mode.

### 2. Get your keys
Dashboard → **Developers** → **API keys**: copy the **Secret key** (`sk_test_…` for testing, `sk_live_…` once verified). Never share it in chat or email.

### 3. Add the secret key to Vercel
Vercel → your project → **Settings → Environment Variables**:

| Name | Value |
|---|---|
| `PAYMONGO_SECRET_KEY` | your `sk_test_…` (later `sk_live_…`) |
| `PAYMONGO_WEBHOOK_SECRET` | from step 4 |
| `NEXT_PUBLIC_SITE_URL` | `https://pahuway-cafe.vercel.app` (optional — used for the return links) |

### 4. Register the webhook
PayMongo needs to know where to send payment confirmations: `https://pahuway-cafe.vercel.app/api/payments/webhook`, event **`checkout_session.payment.paid`**. It returns a **webhook secret** (`whsk_…`) — put it in `PAYMONGO_WEBHOOK_SECRET` on Vercel, then **Redeploy**.
I can register the webhook for you: I'll ask for the secret key through a secure form (it's never shown to me).

> Test and live mode use **different** keys and webhooks. When you switch to live, replace `PAYMONGO_SECRET_KEY` with `sk_live_…` and register a live webhook (new `whsk_…`).

### 5. Turn it on
Admin → **Settings → Online payments (PayMongo)** → switch on → **Save settings**. The switch stays disabled until the keys are installed; a blue banner shows when test keys are active.

### 6. Test with PayMongo's test mode
Place an order with **Pay online**; on PayMongo's test page choose GCash and approve the test payment. Check: the order appears on the staff board with the chime, the customer page shows "Paid online ✓", and the payment shows in the PayMongo dashboard (test data). Try a refund too.

## Costs
PayMongo charges a per-transaction fee (a percentage, different per method — QR Ph is typically the cheapest, GCash a bit more) and no monthly fee. Check https://www.paymongo.com/pricing for current rates. Payouts go to your bank account on PayMongo's schedule.

## Notes & limits
- **Refunds:** PayMongo may not support automatic refunds for every method. If the refund button shows an error, refund from the PayMongo dashboard (or send the money back via GCash) — the order panel tells you which.
- **Isla mobile app:** not changed yet. In the app, PayMongo's page opens in the phone's browser and the customer returns to the website there; the order still works and shows on the staff board. A smoother in-app return can be added when mobile work resumes.
- **Minimum amount:** PayMongo has a small minimum per payment; every menu item is above it.

## For developers
- Code: `src/lib/paymongo.ts` (API client + signature check), `src/app/api/payments/{checkout,webhook,refund,status}`, migration `supabase/migrations/0005_online_payments.sql` (`mark_order_paid`, `expire_unpaid_orders` + pg_cron job).
- Env: `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, optional `PAYMONGO_METHODS` (default `gcash,qrph`), `NEXT_PUBLIC_SITE_URL`.
- Tests: `npm run test:payments` (routes vs. mock PayMongo, 20 checks), DB scenarios in `npm run test:db` (20 checks), and the browser flow:
  ```bash
  PAYMONGO_SECRET_KEY=sk_test_e2e PAYMONGO_WEBHOOK_SECRET=whsk_e2e PAYMONGO_API_BASE=http://127.0.0.1:4010 npx next start -p 3000
  ```
  ```bash
  npm run test:payments:e2e
  ```
