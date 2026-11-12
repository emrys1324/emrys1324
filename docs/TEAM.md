# Team & permissions

Admin → **Settings → Team** (full admins only) is where you add everyone who works with the app: staff, other admins and riders.

## Inviting someone
1. Pick a **role**:
   - **Staff** — only what you tick (see below).
   - **Full admin** — everything, including this Team list.
   - **Rider** — their assigned deliveries only (mobile number required).
2. Enter their name, email (their login) and mobile.
3. For staff, tick what they can do, or use a preset:

   | Permission | Lets them… |
   |---|---|
   | Orders board | accept orders, update status, assign riders, verify GCash |
   | Sold-out switches | mark items and options (e.g. oat milk) sold out |
   | Open / close the store | use the open-for-orders switch |
   | Menu & options | edit items, prices, photos, categories, choices |
   | Delivery zones | edit barangays and delivery fees |
   | Refunds | refund paid online orders |
   | Sales summary | see daily sales and top items |
   | Store settings | hours, branding, GCash, online payments |
   | Scooter rentals | Baybayin bookings, scooters and rental settings (see RENTALS.md) |

   **Barista preset** = Orders board + Sold-out switches + Open/close. **Supervisor preset** adds Menu, Refunds and Sales.
4. **Send invite** — they get an email, tap the link, set their own password and land on their first page.
   Or untick *Email the invite* → **Create invite link** and send that link by Messenger/SMS yourself.

Links work **once** and expire after about an hour (Supabase → Authentication → Providers → Email → *Email OTP Expiration*, up to 24 h). If a link expired, use **Copy invite link** / **Resend invite email** on their row.

## Managing people
- **Edit** — change permissions (or Staff ↔ Full admin), name or mobile. Changes apply on their next page.
- **Copy password-reset link** / **Email password reset** — when someone forgets their password.
- **Switch off** — locks them out immediately (even an open session), keeps all history. **Switch back on** to undo.
- **Delete login** — removes the login; orders and deliveries they handled are kept.
- You can't change, switch off or delete **yourself**, and the **last active admin** can't be removed.

## One-time setup in Supabase (needed for invite emails)
1. **Redirect URL** — Supabase → Authentication → URL Configuration → *Redirect URLs*: add
   `https://pahuway-cafe.vercel.app/welcome` (and your own domain later). Without it, invite links open the home page instead of the set-password page.
2. **Email sending** — Supabase's built-in email is for testing: it only delivers to members of your Supabase organisation and only a few emails per hour. For real staff emails, connect an email service under Authentication → Emails → **SMTP Settings** (e.g. Resend, Brevo or your Google Workspace — most have a free tier). Until then, use **Create invite link** and send links yourself.
3. *(Optional)* Authentication → Emails → Templates: reword the *Invite user* and *Reset password* emails (e.g. add "Pahuway Cafe" and Tagalog text).

## For developers
- DB: `supabase/migrations/0008_team_permissions.sql` (`users.permissions`, `users.is_active`, `has_perm()`, permission-based policies, `set_store_open`, `set_item_sold_out`, `set_option_available`). Scenarios: `supabase/tests/scenarios_team.sql`.
- API (admins only): `src/app/api/admin/team` (list, invite), `[id]` (edit, switch, delete), `[id]/link` (one-time set-password link), `[id]/email` (resend invite / reset email). Shared list of permissions: `src/lib/permissions.ts`.
- `/welcome` accepts all three Supabase link styles (`?token_hash=`, `#access_token=`, `?code=`).
- Test: `npm run test:team` (real emails through the local mailbox).
