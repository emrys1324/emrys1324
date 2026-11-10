# Database schema

Everything is in [`supabase/migrations/0001_schema.sql`](../supabase/migrations/0001_schema.sql). Every table has row-level security (RLS) switched on: Postgres access rules that decide which rows each person can read or change.

```
store_settings (1 row)

menu_categories 1─* menu_items *─* option_groups 1─* item_options
                         (via menu_item_option_groups)

auth.users 1─1 users ─1 riders
                 │         │
                 *         *
delivery_zones 1─* orders ─1 (customer_id → users, rider_id → riders)
                     │
                     1─* order_items
```

## Tables

| Table | What it holds | Who can read / write |
|---|---|---|
| **store_settings** | A single row: store name, **logo and background image (+ fade %), customer/staff header colours and staff header title**, **open/closed switch**, open and close time (closing after midnight is supported), timezone (`Asia/Manila`), delivery minimum, usual prep minutes, closed message, GCash name/number/QR URL. | Everyone reads · admin writes |
| **users** | Profile for each login (1:1 with Supabase `auth.users`): **role** (`customer`/`admin`/`rider`), name, phone, email, saved barangay/street/landmark and **saved map pin** (`saved_lat`, `saved_lng`). Created automatically on sign-up. A trigger stops anyone except an admin from changing roles. | Own row (admin: all) |
| **riders** | Delivery riders: name, phone, active flag, link to their `users` login. Kept separate so a rider can be deactivated without deleting their history. | Admin all · a rider reads their own row |
| **menu_categories** | Coffee, Non-Coffee, Pastries, Meals: name, display order, visible flag. | Everyone reads · admin writes |
| **menu_items** | Name, description, base **price**, photo URL, **is_sold_out**, is_active (hidden), display order. | Everyone reads · admin writes |
| **option_groups** | Reusable choice groups ("Temperature", "Sugar level", "Add-ons", "Size"): pick-one or pick-many, required flag, max picks. | Everyone reads · admin writes |
| **item_options** | Choices within a group ("Iced +₱10", "Oat milk +₱40", "Sharing +₱220"): extra price, default flag, available flag. | Everyone reads · admin writes |
| **menu_item_option_groups** | Which groups apply to which item. Change "Oat milk" once and it updates on every drink. | Everyone reads · admin writes |
| **delivery_zones** | Barangays you deliver to: name, **fee**, active flag, display order. | Everyone reads · admin writes |
| **orders** | One per order: `order_number` (`PH-0001`…), secret `public_token` for the status link, customer name/phone (guests have no `customer_id`), order type, **status**, scheduled time (empty = ASAP), delivery zone (name copied in case the zone is renamed), street/landmark/rider notes, optional **map pin** (`delivery_lat`, `delivery_lng`, both or neither), subtotal/fee/total, payment method and status, GCash reference and screenshot path, assigned rider, cancel reason, and a timestamp for each step. | Admin all · customer their own · rider their assigned. **Nobody inserts directly**: orders come only from `place_order()`. |
| **order_items** | Order lines with **copies** of the item name, base price and chosen options (JSON) at the time of ordering, so later menu edits never change past orders. Also quantity, notes, line total. | Same as the parent order |

### Statuses
`received → preparing → ready → out_for_delivery → completed`, or `cancelled` from any step. Pickup and dine-in skip `out_for_delivery`. A database check makes **cancelling require a reason**. A trigger stamps `accepted_at`, `ready_at`, `picked_up_at`, `completed_at` and `cancelled_at`, marks cash orders **paid** when completed, and prevents prices or the order number from being edited afterwards.

Payment status: `unpaid` (cash) · `for_verification` (manual GCash screenshot uploaded) · `awaiting_payment` (online, not paid yet — hidden from staff) · `paid` · `refunded`. Payment methods: `cash`, `gcash` (manual), `online` (HitPay: GCash/QR Ph). See [PAYMENTS.md](PAYMENTS.md) for `mark_order_paid()` and the 30-minute auto-cancel job.

## Database functions (RPC)

| Function | Who | What it does |
|---|---|---|
| `place_order(order, items)` | anyone | The only way to create an order. Checks the store is open (switch + hours), name, PH mobile format (normalises `+63`), order type, the time slot, that each item exists, is visible and **not sold out**, the option rules (required, pick-one, max picks, options belong to the item), quantities, delivery zone + street + **minimum order**, the optional map pin (both coordinates, inside the Philippines; ignored for pickup/dine-in), and the GCash reference + screenshot. **Recomputes all prices**, then saves the order and its lines in one step. |
| `get_order_by_token(token)` | anyone | Public status page data for one order (no access to anything else). |
| `rider_update_order(order, 'picked_up' \| 'delivered')` | riders | Only works on the rider's own assigned orders, in the right order. |
| `daily_summary(date)` | admins | Order count, completed/cancelled/open, sales, delivery fees, average, top 5 items, sales by order type and by payment method (Manila dates; cancelled orders excluded from sales). |
| `store_is_open_now()`, `within_hours()` | helpers | The opening-hours check, shared by everything above. |

## Storage buckets
- **menu-photos** (public): item photos and the GCash QR. Only admins can upload.
- **payment-proofs** (private): GCash screenshots. Anyone can *upload* into `proofs/`, but **only admins can view**. Max 5 MB, images only.

## Realtime
- The `orders`, `menu_items` and `store_settings` tables publish changes, which drive the staff board, the rider list, sold-out badges and the open/closed state.
- Guests can't read `orders`, so a trigger sends a small broadcast on the channel `order-<public_token>`. The customer's status page listens on that channel and also re-checks every 20 s in case the connection drops.

## Room for Phase 2 (no changes needed now)
- **Payment gateway:** add `payment_provider` and `provider_ref` columns, plus a webhook that sets `payment_status = 'paid'`.
- **Promo codes / loyalty:** a `promotions` table, plus a `discount` column on orders, applied inside `place_order`.
- **Multi-branch:** add `branch_id` to settings, zones, items and orders, and extend the access rules.
- **SMS/Messenger:** a database webhook on `orders` status changes calls an Edge Function.
