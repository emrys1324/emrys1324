# Phase 2: recommended features

Ranked by **value for money**: impact on sales or staff time, divided by build effort. Effort assumes one developer who already knows this codebase. These are rough estimates; confirm scope before committing.

| # | Feature | Impact | Effort | Est. | Why / notes |
|---|---|---|---|---|---|
| 1 | **SMS / Messenger order updates** ("Your order is ready", "Rider on the way") | High | Low | 2–3 days | Customers often close the browser tab. Use a database webhook → Supabase Edge Function → Semaphore (PH SMS gateway, ~₱0.50/SMS) or Messenger. Also helps staff with no-show pickups. |
| 2 | **Filipino / English language toggle** | Medium | Low | 2–3 days | Move UI text into a translation file and add a toggle in the header. Good for locals; tourists keep English. |
| 3 | **Promo codes** (fixed/percent, min spend, expiry, use limit) | High | Low–Med | 3–4 days | Cheap marketing for slow hours ("MERIENDA20" from 2–5 PM). Enforced inside `place_order`. |
| 4 | ✅ **Done — online GCash/QR Ph payments via HitPay** (see [PAYMENTS.md](PAYMENTS.md)) | High | Medium | — | Removes manual screenshot checks and fake receipts; orders are confirmed automatically. Manual GCash kept as a fallback. Cards can be added later via `HITPAY_METHODS`. |
| 5 | **Installable app (PWA) + push notifications for staff and riders** | Medium | Low–Med | 3–4 days | A home-screen icon, and new-order alerts even when the tablet browser is in the background. |
| 6 | **Sales reports & CSV export** (week/month, by item, by hour) | Medium | Low–Med | 3 days | Helps with staffing and bookkeeping; builds on `daily_summary`. |
| 7 | **Loyalty stamps** (e.g. 10th drink free) | Medium | Medium | 5–7 days | Needs customer accounts (already supported). Encourages sign-ups and repeat visits. |
| 8 | **Simple stock counts** (auto sold-out when a count hits 0) | Medium | Medium | 5–7 days | Useful for limited pastries. Start with per-item daily counts, not full ingredient-level inventory. |
| 9 | **Live rider location on the status page** (the customer's delivery pin + rider Google Maps/Waze directions are already done) | Low–Med | Medium–High | 7–10 days | Nice to have, but San Agustin distances are short and phone tracking drains batteries. Do this after SMS updates. |
| 10 | **POS integration** | Varies | High | 2–4 weeks | Only worth it if the café adopts a POS with an API (e.g. Loyverse). Otherwise the staff board already covers order taking. |
| 11 | **Multi-branch support** | Low (today) | High | 2–3 weeks | Add `branch_id` across settings, menu, zones and orders and extend the access rules. Build when a second branch is actually planned. |

## Suggested bundles
- **Phase 2a: quick wins (~2 weeks):** #1 SMS updates, #2 Filipino labels, #3 promo codes, #5 PWA + push.
- **Phase 2b: payments & insight (~2 weeks):** #4 online payments (done — HitPay), #6 reports & export.
- **Phase 3: growth:** #7 loyalty, #8 stock counts, then #9–#11 as the business needs them.

## Small polish items (≤ 1 day each)
- Print-friendly order slip / kitchen ticket view.
- "Order again" button in a signed-in customer's history.
- A "Busy, longer wait" switch that adds 10–15 min to the shown prep time.
- Per-zone delivery minimums.
- Store closures on specific dates (holidays, Holy Week).
