-- Baybayin scooter rentals: daily bookings with an online deposit (HitPay),
-- driver's-license photo, helmets, optional delivery, and no double-booking.
create extension if not exists btree_gist with schema extensions;

-- New team permission: manage scooters, bookings and rental settings.
alter table public.users drop constraint if exists users_permissions_known;
alter table public.users add constraint users_permissions_known
  check (permissions <@ array['orders','stock','open_close','menu','zones','refunds','sales','settings','rentals']::text[]);

-- ---------------------------------------------------------------------
-- Rental settings (one row)
create table if not exists public.rental_settings (
  id                    int primary key default 1 check (id = 1),
  bookings_enabled      boolean not null default false,       -- the Baybayin page stays "Coming soon" until on
  deposit_percent       int     not null default 30 check (deposit_percent between 10 and 100),
  security_deposit      numeric(10,2) not null default 0 check (security_deposit >= 0),
  security_deposit_note text,                                  -- e.g. "or leave a valid ID"
  delivery_fee          numeric(10,2) not null default 0 check (delivery_fee >= 0),
  pickup_note           text,                                  -- where/when to pick up
  max_days              int     not null default 30 check (max_days between 1 and 90),
  updated_at            timestamptz not null default now()
);
insert into public.rental_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Scooters
create table if not exists public.scooters (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 60),
  description text,
  daily_rate  numeric(10,2) not null check (daily_rate > 0),
  photo_url   text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Bookings
create sequence if not exists public.rental_booking_seq;
create table if not exists public.rental_bookings (
  id                 uuid primary key default gen_random_uuid(),
  booking_number     text not null unique default ('BY-' || lpad(nextval('public.rental_booking_seq')::text, 4, '0')),
  public_token       uuid not null unique default gen_random_uuid(),
  scooter_id         uuid not null references public.scooters (id),
  scooter_name       text not null,                      -- copied at booking time
  customer_name      text not null,
  customer_phone     text not null,
  customer_email     text,
  start_date         date not null,                      -- pickup day
  end_date           date not null,                      -- return day (same day = 1-day rental)
  days               int  not null check (days >= 1),
  daily_rate         numeric(10,2) not null,
  helmets            int  not null default 1 check (helmets between 0 and 2),
  delivery           boolean not null default false,
  delivery_address   text,
  delivery_fee       numeric(10,2) not null default 0,
  total              numeric(10,2) not null,
  deposit_amount     numeric(10,2) not null,             -- paid online now
  security_deposit   numeric(10,2) not null default 0,   -- shown to the customer; collected at pickup
  license_path       text not null,                      -- private "license-photos" bucket
  notes              text,
  status             text not null default 'awaiting_deposit'
                     check (status in ('awaiting_deposit', 'confirmed', 'picked_up', 'returned', 'cancelled')),
  payment_status     text not null default 'awaiting_payment'
                     check (payment_status in ('awaiting_payment', 'deposit_paid', 'paid', 'refunded')),
  payment_expires_at timestamptz,
  gateway_ref        text unique,
  checkout_url       text,
  gateway_payment_id text,
  gateway_refund_id  text,
  deposit_paid_at    timestamptz,
  picked_up_at       timestamptz,
  returned_at        timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (end_date >= start_date),
  check (not delivery or length(trim(coalesce(delivery_address, ''))) >= 5),
  check (status <> 'cancelled' or cancel_reason is not null),
  -- one scooter can't be booked twice for overlapping days (return day frees it for the next pickup)
  constraint no_double_booking exclude using gist (
    scooter_id with =,
    daterange(start_date, greatest(end_date, start_date + 1), '[)') with &&
  ) where (status <> 'cancelled')
);
create index if not exists rental_bookings_dates on public.rental_bookings (start_date, end_date);

create or replace function public.rental_bookings_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    case new.status
      when 'picked_up' then new.picked_up_at := coalesce(new.picked_up_at, now());
      when 'returned'  then new.returned_at  := coalesce(new.returned_at, now());
      when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
      else null;
    end case;
  end if;
  -- prices, dates and the customer's identity are fixed once booked
  new.booking_number := old.booking_number; new.public_token := old.public_token;
  new.total := old.total; new.deposit_amount := old.deposit_amount; new.daily_rate := old.daily_rate;
  new.days := old.days; new.start_date := old.start_date; new.end_date := old.end_date;
  new.scooter_id := old.scooter_id; new.license_path := old.license_path;
  return new;
end $$;
drop trigger if exists rental_bookings_touch on public.rental_bookings;
create trigger rental_bookings_touch before update on public.rental_bookings
  for each row execute function public.rental_bookings_touch();

-- ---------------------------------------------------------------------
-- Access rules
alter table public.rental_settings enable row level security;
alter table public.scooters        enable row level security;
alter table public.rental_bookings enable row level security;

create policy "rental settings public read" on public.rental_settings for select using (true);
create policy "rental settings staff write" on public.rental_settings for update to authenticated
  using (public.has_perm('rentals')) with check (public.has_perm('rentals'));

create policy "scooters public read" on public.scooters for select using (is_active or public.has_perm('rentals'));
create policy "scooters staff write" on public.scooters for all to authenticated
  using (public.has_perm('rentals')) with check (public.has_perm('rentals'));

-- Customers never read the table directly (they use their booking link); no direct inserts.
create policy "bookings staff read"   on public.rental_bookings for select to authenticated using (public.has_perm('rentals'));
create policy "bookings staff update" on public.rental_bookings for update to authenticated
  using (public.has_perm('rentals')) with check (public.has_perm('rentals'));

-- License photos: anyone can upload into licenses/ (write-only); only rental staff can view.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('license-photos', 'license-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;
create policy "license upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'license-photos' and (storage.foldername(name))[1] = 'licenses');
create policy "license staff read" on storage.objects for select to authenticated
  using (bucket_id = 'license-photos' and public.has_perm('rentals'));
-- scooter photos go in the public menu-photos bucket under scooters/
create policy "scooter photos staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-photos' and (storage.foldername(name))[1] = 'scooters' and public.has_perm('rentals'));
create policy "scooter photos staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-photos' and (storage.foldername(name))[1] = 'scooters' and public.has_perm('rentals'));

-- ---------------------------------------------------------------------
-- Unpaid holds expire after 30 minutes (also checked when someone books).
create or replace function public.expire_unpaid_bookings() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update public.rental_bookings
     set status = 'cancelled', cancel_reason = 'The deposit was not paid within 30 minutes.'
   where status = 'awaiting_deposit' and payment_expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.expire_unpaid_bookings() from public, anon, authenticated;
do $do$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-unpaid-bookings', '*/5 * * * *', 'select public.expire_unpaid_bookings()');
exception when others then
  raise notice 'pg_cron unavailable (%); unpaid bookings expire only when someone books', sqlerrm;
end
$do$;

-- Which days are taken (no personal details) — for the booking calendar.
create or replace function public.scooter_bookings_between(p_from date, p_to date)
returns table (scooter_id uuid, start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select b.scooter_id, b.start_date, greatest(b.end_date, b.start_date + 1) - 1
  from public.rental_bookings b
  where b.status <> 'cancelled'
    and not (b.status = 'awaiting_deposit' and b.payment_expires_at < now())
    and b.start_date <= p_to and greatest(b.end_date, b.start_date + 1) > p_from;
$$;

-- The only way to create a booking. Recomputes every price on the server.
create or replace function public.book_scooter(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  rs        public.rental_settings;
  sc        public.scooters;
  v_today   date := (now() at time zone 'Asia/Manila')::date;
  v_start   date;
  v_end     date;
  v_days    int;
  v_phone   text := regexp_replace(coalesce(p->>'customer_phone', ''), '[\s-]', '', 'g');
  v_name    text := trim(coalesce(p->>'customer_name', ''));
  v_email   text := nullif(trim(coalesce(p->>'customer_email', '')), '');
  v_helmets int;
  v_deliv   boolean := coalesce((p->>'delivery')::boolean, false);
  v_addr    text := nullif(trim(coalesce(p->>'delivery_address', '')), '');
  v_license text := p->>'license_path';
  v_fee     numeric := 0;
  v_total   numeric;
  v_deposit numeric;
  b         public.rental_bookings;
begin
  select * into rs from public.rental_settings where id = 1;
  if not rs.bookings_enabled then raise exception 'CLOSED: Scooter bookings are not open yet.'; end if;

  select * into sc from public.scooters where id = (p->>'scooter_id')::uuid and is_active;
  if not found then raise exception 'INVALID: Please choose a scooter.'; end if;

  begin
    v_start := (p->>'start_date')::date;
    v_end   := (p->>'end_date')::date;
  exception when others then raise exception 'INVALID: Please choose your pickup and return dates.';
  end;
  if v_start is null or v_end is null then raise exception 'INVALID: Please choose your pickup and return dates.'; end if;
  if v_start < v_today then raise exception 'INVALID: The pickup date has passed. Please choose today or later.'; end if;
  if v_start > v_today + 180 then raise exception 'INVALID: Bookings open up to 6 months ahead.'; end if;
  if v_end < v_start then raise exception 'INVALID: The return date must be on or after the pickup date.'; end if;
  v_days := greatest(v_end - v_start, 1);
  if v_days > rs.max_days then raise exception 'INVALID: Rentals can be up to % days.', rs.max_days; end if;

  if length(v_name) < 2 then raise exception 'INVALID: Please enter your name.'; end if;
  if v_phone ~ '^\+?63' then v_phone := '0' || regexp_replace(v_phone, '^\+?63', ''); end if;
  if v_phone !~ '^09\d{9}$' then raise exception 'INVALID: Use the format 09XXXXXXXXX for your mobile number.'; end if;
  if v_email is not null and v_email !~ '^\S+@\S+\.\S+$' then raise exception 'INVALID: Please check your email address.'; end if;

  begin v_helmets := coalesce((p->>'helmets')::int, 1);
  exception when others then raise exception 'INVALID: Choose 0, 1 or 2 helmets.'; end;
  if v_helmets not between 0 and 2 then raise exception 'INVALID: Choose 0, 1 or 2 helmets.'; end if;

  if v_deliv then
    if v_addr is null or length(v_addr) < 5 then raise exception 'INVALID: Please enter the delivery address (resort or house).'; end if;
    v_fee := rs.delivery_fee;
  else
    v_addr := null;
  end if;

  if v_license is null or v_license !~ '^licenses/[A-Za-z0-9._\-/]+$' then
    raise exception 'INVALID: Please add a photo of your driver''s license.';
  end if;

  v_total   := round(v_days * sc.daily_rate + v_fee, 2);
  v_deposit := least(v_total, greatest(round(v_total * rs.deposit_percent / 100.0), 1));

  perform public.expire_unpaid_bookings();  -- free expired holds first
  begin
    insert into public.rental_bookings (scooter_id, scooter_name, customer_name, customer_phone, customer_email,
      start_date, end_date, days, daily_rate, helmets, delivery, delivery_address, delivery_fee,
      total, deposit_amount, security_deposit, license_path, notes, payment_expires_at)
    values (sc.id, sc.name, v_name, v_phone, v_email, v_start, v_end, v_days, sc.daily_rate, v_helmets, v_deliv, v_addr, v_fee,
      v_total, v_deposit, rs.security_deposit, v_license, nullif(left(trim(coalesce(p->>'notes', '')), 500), ''), now() + interval '30 minutes')
    returning * into b;
  exception when exclusion_violation then
    raise exception 'UNAVAILABLE: Sorry, % is already booked on some of those days. Please pick other dates or another scooter.', sc.name;
  end;
  return jsonb_build_object('token', b.public_token, 'booking_number', b.booking_number, 'total', b.total, 'deposit', b.deposit_amount);
end $$;

-- Public booking status (by the secret link only).
create or replace function public.get_booking_by_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'booking_number', b.booking_number, 'status',
      case when b.status = 'awaiting_deposit' and b.payment_expires_at < now() then 'cancelled' else b.status end,
    'payment_status', b.payment_status, 'scooter_name', b.scooter_name, 'customer_name', b.customer_name,
    'start_date', b.start_date, 'end_date', b.end_date, 'days', b.days, 'daily_rate', b.daily_rate,
    'helmets', b.helmets, 'delivery', b.delivery, 'delivery_address', b.delivery_address, 'delivery_fee', b.delivery_fee,
    'total', b.total, 'deposit_amount', b.deposit_amount, 'security_deposit', b.security_deposit,
    'checkout_url', b.checkout_url, 'payment_expires_at', b.payment_expires_at, 'cancel_reason', b.cancel_reason,
    'created_at', b.created_at)
  from public.rental_bookings b where b.public_token = p_token;
$$;

-- Called only by trusted server code after HitPay's API confirmed the deposit.
create or replace function public.mark_booking_paid(p_ref text, p_payment_id text, p_amount_centavos bigint)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare b public.rental_bookings;
begin
  select * into b from public.rental_bookings where gateway_ref = p_ref for update;
  if not found then return 'not_found'; end if;
  if b.payment_status in ('deposit_paid', 'paid', 'refunded') then return 'already_paid'; end if;
  if p_amount_centavos <> round(b.deposit_amount * 100)::bigint then return 'amount_mismatch'; end if;
  update public.rental_bookings
     set payment_status = case when b.deposit_amount >= b.total then 'paid' else 'deposit_paid' end,
         gateway_payment_id = p_payment_id, deposit_paid_at = now(),
         status = case when status = 'awaiting_deposit' then 'confirmed' else status end
   where id = b.id;
  return case when b.status = 'cancelled' then 'paid_after_cancel' else 'paid' end;
end $$;

revoke execute on function public.book_scooter(jsonb)              from public;
revoke execute on function public.mark_booking_paid(text, text, bigint) from public, anon, authenticated;
grant  execute on function public.book_scooter(jsonb)              to anon, authenticated;
grant  execute on function public.get_booking_by_token(uuid)       to anon, authenticated;
grant  execute on function public.scooter_bookings_between(date, date) to anon, authenticated;
grant  execute on function public.mark_booking_paid(text, text, bigint) to service_role;

alter publication supabase_realtime add table public.rental_bookings, public.scooters, public.rental_settings;
