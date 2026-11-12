# Baybayin scooter rentals

Customers book a scooter with a **pickup and return date and time** on the Baybayin page (`/baybayin`), charged **per 24 hours**, upload a photo of their driver's license, choose helmets and (optionally) delivery to their resort or house, and pay an **online deposit** through HitPay. The rest is paid at pickup.

## How it works
1. **Customer** picks the pickup and return **date and time** (any time of day, 30-minute steps; at least 1 hour). Days are counted in **24-hour blocks**: 9 AM → 9 AM next day = 1 day; a same-day rental = 1 day; returning later than the **grace period** (default 60 min) adds a day. Price = days × the scooter's daily rate, plus the delivery fee if they want delivery. Scooters already booked during those times show as **Booked**.
2. They fill in name, mobile, optional email, helmets (0–2), delivery address (if delivery), the **license photo** and notes, then tap **Pay ₱… deposit** (your deposit % of the total).
3. On HitPay they pay with QR Ph (GCash, Maya, bank apps) or online banking, and come back to their booking page: **"You're booked! Deposit received ✓"**, the balance due at pickup, the security-deposit notice and pickup instructions. That page is their booking link.
4. A booking is held for **30 minutes** while the deposit is unpaid; after that the scooter is released. Their booking page offers **Pay now** until then.
5. **No double-booking:** the database itself refuses overlapping bookings for the same scooter, even if two people book at the same moment. After each return the scooter stays blocked for the **time between bookings** (default 30 min) for handover and checking.

## Staff: Admin → Rentals
Visible to full admins and staff with the **Scooter rentals** permission (Settings → Team).
- **Bookings** — filters (Confirmed & on the road · Waiting for deposit · Returned & cancelled · All), *pickup today at …* / *due back today at …* hints and an **Overdue** badge when a scooter on the road is past its return time. Open a booking to see the customer (tap-to-call), dates, helmets, delivery address, notes, what to **collect at pickup**, the security deposit, and the **license photo** (private — only rental staff can open it). Buttons: **Mark picked up** → **Balance collected** → **Mark returned**, or **Cancel** with a reason. A cancelled booking with a paid deposit shows **Refund needed** → **Refund ₱… deposit** (needs the Refunds permission too).
- **Scooters** — add/edit name, short description, **daily rate**, photo, and *Show on the booking page*. Price changes only affect new bookings; hide a scooter instead of deleting it.
- **Settings** — **Accept bookings** (off = the page shows *Coming soon*), online deposit %, delivery fee, longest rental (days), **late-return grace** (minutes), **time between bookings** (minutes), security deposit at pickup (+ note, e.g. "or leave a valid ID"), pickup instructions.

## Going live checklist
1. Add your scooters (with photos and daily rates).
2. Set the deposit %, delivery fee, security deposit and pickup instructions.
3. Give the people who run rentals the **Scooter rentals** permission (Settings → Team).
4. Turn on **Accept bookings** and place one real test booking with a small deposit; refund it from the booking.

HitPay must be set up on the website (it already is for café orders — same keys). Deposits arrive in the same HitPay account.

## Notes & limits
- License photos are stored privately; consider deleting old ones periodically (Supabase → Storage → license-photos).
- Not yet: SMS/email confirmations, a calendar view, hourly rentals, damage/fuel charges — see docs/PHASE2.md ideas.

## For developers
- DB: `supabase/migrations/0011_scooter_rentals.sql` + `0012_rental_times.sql` — `rental_settings` (incl. `grace_minutes`, `turnaround_minutes`), `scooters`, `rental_bookings` (`pickup_at`, `return_at`, `blocked_until` = return + turnaround; exclusion constraint `no_double_booking` on `tstzrange(pickup_at, blocked_until)`), `rental_days()` (24-h blocks with grace), `busy_scooters(pickup, return)`, `book_scooter()` (server pricing + validation), `scooter_bookings_between()` (calendar, no personal data), `get_booking_by_token()`, `mark_booking_paid()` (service role), `expire_unpaid_bookings()` (pg_cron every 5 min + on each booking), private `license-photos` bucket, `rentals` permission. Scenarios: `supabase/tests/scenarios_rentals.sql`.
- API: `/api/rentals/checkout` (create/resume HitPay request for the deposit), `/api/rentals/verify` (return-check), `/api/rentals/refund`; the shared `/api/payments/webhook` confirms deposits too (`confirmPayment` tries orders, then bookings).
- UI: `src/components/customer/{ScooterBooking,BookingStatusScreen,BaybayinScreen}.tsx`, `src/components/admin/RentalsAdmin.tsx`, `src/lib/rentals.ts`.
- Test: `npm run test:rentals` (27 checks, mock HitPay; start the app with the HitPay test env as in docs/PAYMENTS.md).
