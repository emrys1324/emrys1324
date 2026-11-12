-- Overdue scooters stay blocked until they're returned: while a booking is picked up and past its return
-- (+ turnaround), the scooter shows as unavailable for every date and can't be booked, until staff mark it
-- returned (which then frees it immediately, see 0017).

-- effective end of a booking's hold: overdue = held "indefinitely" (400 days, beyond the 6-month booking window)
create or replace function public.busy_scooters(p_pickup timestamptz, p_return timestamptz)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct b.scooter_id
  from public.rental_bookings b, public.rental_settings rs
  where rs.id = 1 and b.status <> 'cancelled'
    and not (b.status = 'awaiting_deposit' and coalesce(b.payment_expires_at < now(), false))
    and tstzrange(b.pickup_at, case when b.status = 'picked_up' and b.blocked_until <= now() then now() + interval '400 days' else b.blocked_until end, '[)') && tstzrange(p_pickup, p_return + make_interval(mins => rs.turnaround_minutes), '[)');
$$;

create or replace function public.scooter_calendar(p_from date, p_to date)
returns table (scooter_id uuid, pickup_at timestamptz, blocked_until timestamptz)
language sql stable security definer set search_path = public as $$
  select b.scooter_id, b.pickup_at, case when b.status = 'picked_up' and b.blocked_until <= now() then now() + interval '400 days' else b.blocked_until end
  from public.rental_bookings b
  where b.status <> 'cancelled'
    and not (b.status = 'awaiting_deposit' and coalesce(b.payment_expires_at < now(), false))
    and b.pickup_at < ((p_to + 1)::timestamp at time zone 'Asia/Manila')
    and case when b.status = 'picked_up' and b.blocked_until <= now() then now() + interval '400 days' else b.blocked_until end > (p_from::timestamp at time zone 'Asia/Manila');
$$;
grant execute on function public.scooter_calendar(date, date) to anon, authenticated;

create or replace function public.scooter_bookings_between(p_from date, p_to date)
returns table (scooter_id uuid, start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select b.scooter_id, (b.pickup_at at time zone 'Asia/Manila')::date, (case when b.status = 'picked_up' and b.blocked_until <= now() then now() + interval '400 days' else b.blocked_until end at time zone 'Asia/Manila')::date
  from public.rental_bookings b
  where b.status <> 'cancelled'
    and not (b.status = 'awaiting_deposit' and coalesce(b.payment_expires_at < now(), false))
    and (b.pickup_at at time zone 'Asia/Manila')::date <= p_to and (case when b.status = 'picked_up' and b.blocked_until <= now() then now() + interval '400 days' else b.blocked_until end at time zone 'Asia/Manila')::date >= p_from;
$$;

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
  v_license text := p->>'license_path';
  v_ref     text := nullif(regexp_replace(coalesce(p->>'gcash_reference', ''), '\s', '', 'g'), '');
  v_proof   text := p->>'payment_proof_path';
  v_method  text := coalesce(nullif(p->>'payment_method', ''), 'gcash');
  v_total   numeric;
  v_deposit numeric;
  b         public.rental_bookings;
begin
  select * into rs from public.rental_settings where id = 1;
  if not rs.bookings_enabled or length(trim(coalesce(rs.terms, ''))) = 0 then
    raise exception 'CLOSED: Scooter bookings are not open yet.';
  end if;

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
  if (v_pickup at time zone 'Asia/Manila')::time not between rs.open_time and rs.close_time
     or (v_return at time zone 'Asia/Manila')::time not between rs.open_time and rs.close_time then
    raise exception 'INVALID: Pickup and return are from % to % only. For other times, please message us to arrange.',
      to_char(rs.open_time, 'FMHH12:MI AM'), to_char(rs.close_time, 'FMHH12:MI AM');
  end if;
  v_days := public.rental_days(v_pickup, v_return, rs.grace_minutes);
  if v_days > rs.max_days then raise exception 'INVALID: Rentals can be up to % days.', rs.max_days; end if;

  if length(v_name) < 2 then raise exception 'INVALID: Please enter your name.'; end if;
  if v_phone ~ '^\+?63' then v_phone := '0' || regexp_replace(v_phone, '^\+?63', ''); end if;
  if v_phone !~ '^09\d{9}$' then raise exception 'INVALID: Use the format 09XXXXXXXXX for your mobile number.'; end if;
  if v_email is not null and v_email !~ '^\S+@\S+\.\S+$' then raise exception 'INVALID: Please check your email address.'; end if;

  begin v_helmets := coalesce((p->>'helmets')::int, 1);
  exception when others then raise exception 'INVALID: Choose 0, 1 or 2 helmets.'; end;
  if v_helmets not between 0 and 2 then raise exception 'INVALID: Choose 0, 1 or 2 helmets.'; end if;

  if v_license is null or v_license !~ '^licenses/[A-Za-z0-9._\-/]+$' then
    raise exception 'INVALID: Please add a photo of your driver''s license.';
  end if;
  if coalesce((p->>'terms_agreed')::boolean, false) is not true then
    raise exception 'INVALID: Please read and agree to the terms and conditions.';
  end if;
  if v_method not in ('gcash', 'online') then raise exception 'INVALID: Please choose how to pay the deposit.'; end if;
  if v_method = 'online' then
    if not rs.online_enabled then raise exception 'INVALID: Online payment is not available right now. Please pay with GCash.'; end if;
    v_ref := null; v_proof := null;
  else
    if v_ref is null or length(v_ref) < 4 then raise exception 'INVALID: Please enter your GCash reference number.'; end if;
    if v_proof is null or v_proof !~ '^proofs/rentals/[A-Za-z0-9._\-/]+$' then
      raise exception 'INVALID: Please upload a screenshot of your GCash payment.';
    end if;
  end if;

  v_total   := round(v_days * sc.daily_rate, 2);
  v_deposit := least(v_total, greatest(round(v_total * rs.deposit_percent / 100.0), 1));

  perform public.expire_unpaid_bookings();  -- free expired online holds first
  -- a scooter that is out and past its return time can't be booked again until staff mark it returned
  if exists (select 1 from public.rental_bookings o where o.scooter_id = sc.id and o.status = 'picked_up' and o.blocked_until <= now()) then
    raise exception 'UNAVAILABLE: Sorry, % is not back yet. Please choose another scooter or try again later.', sc.name;
  end if;
  begin
    insert into public.rental_bookings (scooter_id, scooter_name, customer_name, customer_phone, customer_email,
      start_date, end_date, pickup_at, return_at, blocked_until, days, daily_rate, helmets, delivery, delivery_address, delivery_fee,
      total, deposit_amount, security_deposit, license_path, notes,
      payment_method, payment_status, gcash_reference, payment_proof_path, payment_expires_at, terms_agreed_at, terms_snapshot)
    values (sc.id, sc.name, v_name, v_phone, v_email,
      (v_pickup at time zone 'Asia/Manila')::date, (v_return at time zone 'Asia/Manila')::date,
      v_pickup, v_return, v_return + make_interval(mins => rs.turnaround_minutes),
      v_days, sc.daily_rate, v_helmets, false, null, 0,
      v_total, v_deposit, rs.security_deposit, v_license, nullif(left(trim(coalesce(p->>'notes', '')), 500), ''),
      v_method, case when v_method = 'online' then 'awaiting_payment' else 'for_verification' end, v_ref, v_proof,
      case when v_method = 'online' then now() + interval '30 minutes' end, now(), rs.terms)
    returning * into b;
  exception when exclusion_violation then
    raise exception 'UNAVAILABLE: Sorry, % is already booked during those times. Please pick other times or another scooter.', sc.name;
  end;
  return jsonb_build_object('token', b.public_token, 'booking_number', b.booking_number, 'total', b.total, 'deposit', b.deposit_amount, 'days', b.days, 'payment_method', b.payment_method);
end $$;
