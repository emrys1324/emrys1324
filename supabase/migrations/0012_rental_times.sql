-- Pickup and return TIMES for scooter bookings.
-- Days are counted in 24-hour blocks with a grace period; a turnaround buffer
-- keeps back-to-back bookings apart. Any time of day, 30-minute steps.

alter table public.rental_settings
  add column if not exists grace_minutes      int not null default 60 check (grace_minutes between 0 and 240),
  add column if not exists turnaround_minutes int not null default 30 check (turnaround_minutes between 0 and 240);

alter table public.rental_bookings
  add column if not exists pickup_at     timestamptz,
  add column if not exists return_at     timestamptz,
  add column if not exists blocked_until timestamptz;   -- return_at + turnaround at booking time

-- existing bookings (date-only): assume 9:00 AM Manila pickup and return
update public.rental_bookings
   set pickup_at = (start_date + time '09:00') at time zone 'Asia/Manila',
       return_at = (start_date + time '09:00') at time zone 'Asia/Manila' + make_interval(days => days)
 where pickup_at is null;
update public.rental_bookings set blocked_until = return_at where blocked_until is null;

alter table public.rental_bookings
  alter column pickup_at set not null,
  alter column return_at set not null,
  alter column blocked_until set not null,
  add constraint rental_times_order check (return_at > pickup_at and blocked_until >= return_at);

-- overlap rule now uses exact times (+ turnaround)
alter table public.rental_bookings drop constraint if exists no_double_booking;
alter table public.rental_bookings add constraint no_double_booking exclude using gist (
  scooter_id with =,
  tstzrange(pickup_at, blocked_until, '[)') with &&
) where (status <> 'cancelled');

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
  -- prices, times and the customer's identity are fixed once booked
  new.booking_number := old.booking_number; new.public_token := old.public_token;
  new.total := old.total; new.deposit_amount := old.deposit_amount; new.daily_rate := old.daily_rate;
  new.days := old.days; new.start_date := old.start_date; new.end_date := old.end_date;
  new.pickup_at := old.pickup_at; new.return_at := old.return_at; new.blocked_until := old.blocked_until;
  new.scooter_id := old.scooter_id; new.license_path := old.license_path;
  return new;
end $$;

-- 24-hour blocks: 9 AM → 9 AM next day = 1 day; over by more than the grace period adds a day.
create or replace function public.rental_days(p_pickup timestamptz, p_return timestamptz, p_grace_minutes int)
returns int language sql immutable as $$
  select greatest(1, ceil(extract(epoch from (p_return - p_pickup - make_interval(mins => p_grace_minutes))) / 86400.0)::int);
$$;

-- Which scooters are taken for a pickup → return window (no personal details).
create or replace function public.busy_scooters(p_pickup timestamptz, p_return timestamptz)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct b.scooter_id
  from public.rental_bookings b, public.rental_settings rs
  where rs.id = 1 and b.status <> 'cancelled'
    and not (b.status = 'awaiting_deposit' and b.payment_expires_at < now())
    and tstzrange(b.pickup_at, b.blocked_until, '[)') && tstzrange(p_pickup, p_return + make_interval(mins => rs.turnaround_minutes), '[)');
$$;
grant execute on function public.busy_scooters(timestamptz, timestamptz) to anon, authenticated;

-- kept for older screens: taken days per scooter
create or replace function public.scooter_bookings_between(p_from date, p_to date)
returns table (scooter_id uuid, start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select b.scooter_id, (b.pickup_at at time zone 'Asia/Manila')::date, (b.blocked_until at time zone 'Asia/Manila')::date
  from public.rental_bookings b
  where b.status <> 'cancelled'
    and not (b.status = 'awaiting_deposit' and b.payment_expires_at < now())
    and (b.pickup_at at time zone 'Asia/Manila')::date <= p_to and (b.blocked_until at time zone 'Asia/Manila')::date >= p_from;
$$;

-- The only way to create a booking. Times are Manila local "YYYY-MM-DDTHH:MM", 30-minute steps.
create or replace function public.book_scooter(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  rs        public.rental_settings;
  sc        public.scooters;
  v_pickup  timestamptz;
  v_return  timestamptz;
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
    v_pickup := (p->>'pickup_at')::timestamp at time zone 'Asia/Manila';
    v_return := (p->>'return_at')::timestamp at time zone 'Asia/Manila';
  exception when others then raise exception 'INVALID: Please choose your pickup and return times.';
  end;
  if v_pickup is null or v_return is null then raise exception 'INVALID: Please choose your pickup and return times.'; end if;
  if extract(minute from v_pickup at time zone 'Asia/Manila') not in (0, 30) or extract(second from v_pickup) <> 0
     or extract(minute from v_return at time zone 'Asia/Manila') not in (0, 30) or extract(second from v_return) <> 0 then
    raise exception 'INVALID: Times must be on the hour or half hour.';
  end if;
  if v_pickup < now() - interval '15 minutes' then raise exception 'INVALID: The pickup time has passed. Please choose a later time.'; end if;
  if v_pickup > now() + interval '180 days' then raise exception 'INVALID: Bookings open up to 6 months ahead.'; end if;
  if v_return < v_pickup + interval '1 hour' then raise exception 'INVALID: The return time must be at least 1 hour after pickup.'; end if;
  v_days := public.rental_days(v_pickup, v_return, rs.grace_minutes);
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
      start_date, end_date, pickup_at, return_at, blocked_until, days, daily_rate, helmets, delivery, delivery_address, delivery_fee,
      total, deposit_amount, security_deposit, license_path, notes, payment_expires_at)
    values (sc.id, sc.name, v_name, v_phone, v_email,
      (v_pickup at time zone 'Asia/Manila')::date, (v_return at time zone 'Asia/Manila')::date,
      v_pickup, v_return, v_return + make_interval(mins => rs.turnaround_minutes),
      v_days, sc.daily_rate, v_helmets, v_deliv, v_addr, v_fee,
      v_total, v_deposit, rs.security_deposit, v_license, nullif(left(trim(coalesce(p->>'notes', '')), 500), ''), now() + interval '30 minutes')
    returning * into b;
  exception when exclusion_violation then
    raise exception 'UNAVAILABLE: Sorry, % is already booked during those times. Please pick other times or another scooter.', sc.name;
  end;
  return jsonb_build_object('token', b.public_token, 'booking_number', b.booking_number, 'total', b.total, 'deposit', b.deposit_amount, 'days', b.days);
end $$;

create or replace function public.get_booking_by_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'booking_number', b.booking_number, 'status',
      case when b.status = 'awaiting_deposit' and b.payment_expires_at < now() then 'cancelled' else b.status end,
    'payment_status', b.payment_status, 'scooter_name', b.scooter_name, 'customer_name', b.customer_name,
    'start_date', b.start_date, 'end_date', b.end_date, 'pickup_at', b.pickup_at, 'return_at', b.return_at,
    'days', b.days, 'daily_rate', b.daily_rate,
    'helmets', b.helmets, 'delivery', b.delivery, 'delivery_address', b.delivery_address, 'delivery_fee', b.delivery_fee,
    'total', b.total, 'deposit_amount', b.deposit_amount, 'security_deposit', b.security_deposit,
    'checkout_url', b.checkout_url, 'payment_expires_at', b.payment_expires_at, 'cancel_reason', b.cancel_reason,
    'created_at', b.created_at)
  from public.rental_bookings b where b.public_token = p_token;
$$;
