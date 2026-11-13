-- Customers who can't finish an online (HitPay) payment can switch to the manual GCash route instead:
-- send to the café's GCash and upload the screenshot; staff then verify it as usual.
-- Called only by the server (service role), after it has checked with HitPay that nothing was paid yet.

create or replace function public.switch_order_to_gcash(p_token uuid, p_proof_path text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare o public.orders;
begin
  if p_proof_path is null or p_proof_path !~ '^proofs/[A-Za-z0-9._\-/]+$' then return 'invalid_proof'; end if;
  select * into o from public.orders where public_token = p_token for update;
  if not found then return 'not_found'; end if;
  if o.status = 'cancelled' then return 'cancelled'; end if;
  if o.payment_method::text <> 'online' or o.payment_status::text <> 'awaiting_payment' then return 'not_awaiting'; end if;
  update public.orders
     set payment_method = 'gcash', payment_status = 'for_verification', payment_proof_path = p_proof_path,
         gcash_reference = null, payment_expires_at = null, checkout_url = null
   where id = o.id;
  return 'switched';
end $$;

create or replace function public.switch_booking_to_gcash(p_token uuid, p_proof_path text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare b public.rental_bookings;
begin
  if p_proof_path is null or p_proof_path !~ '^proofs/rentals/[A-Za-z0-9._\-/]+$' then return 'invalid_proof'; end if;
  select * into b from public.rental_bookings where public_token = p_token for update;
  if not found then return 'not_found'; end if;
  if b.status = 'cancelled' or (b.status = 'awaiting_deposit' and coalesce(b.payment_expires_at < now(), false)) then return 'cancelled'; end if;
  if b.payment_method <> 'online' or b.payment_status <> 'awaiting_payment' then return 'not_awaiting'; end if;
  perform set_config('app.payment_switch', '1', true);
  update public.rental_bookings
     set payment_method = 'gcash', payment_status = 'for_verification', payment_proof_path = p_proof_path,
         payment_expires_at = null, checkout_url = null
   where id = b.id;
  perform set_config('app.payment_switch', '', true);
  return 'switched';
end $$;

revoke execute on function public.switch_order_to_gcash(uuid, text) from public, anon, authenticated;
revoke execute on function public.switch_booking_to_gcash(uuid, text) from public, anon, authenticated;
grant execute on function public.switch_order_to_gcash(uuid, text) to service_role;
grant execute on function public.switch_booking_to_gcash(uuid, text) to service_role;

-- staff are alerted when a switched order arrives for GCash checking (like a newly paid one)
create or replace function public.orders_push_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url    text := (select value from private.app_config where key = 'push_webhook_url');
  v_secret text := (select value from private.app_config where key = 'push_webhook_secret');
  v_new_order bool := (tg_op = 'INSERT' and new.payment_method::text <> 'online')
                   or (tg_op = 'UPDATE' and old.payment_status::text = 'awaiting_payment'
                       and new.payment_status::text in ('paid', 'for_verification') and new.status <> 'cancelled');
  v_rider     bool := tg_op = 'UPDATE' and new.rider_id is not null and new.rider_id is distinct from old.rider_id;
  v_status    bool := tg_op = 'UPDATE' and new.status is distinct from old.status;
begin
  if v_url is null or v_secret is null then return null; end if;
  if not (v_new_order or v_rider or v_status) then return null; end if;
  begin
    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object('order_id', new.id, 'status', new.status,
                                    'new_order', v_new_order, 'rider_assigned', v_rider, 'status_changed', v_status),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 5000
    );
  exception when others then
    null;
  end;
  return null;
end $$;

-- bookings: payment method / receipt stay locked except during switch_booking_to_gcash()
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
  if new.payment_status in ('deposit_paid', 'paid') and old.payment_status in ('awaiting_payment', 'for_verification') then
    new.deposit_paid_at := coalesce(new.deposit_paid_at, now());
  end if;
  -- prices, times, payment proof and the customer's identity are fixed once booked
  new.booking_number := old.booking_number; new.public_token := old.public_token;
  new.total := old.total; new.deposit_amount := old.deposit_amount; new.daily_rate := old.daily_rate;
  new.days := old.days; new.start_date := old.start_date; new.end_date := old.end_date;
  new.pickup_at := old.pickup_at; new.return_at := old.return_at; new.blocked_until := old.blocked_until;
  new.scooter_id := old.scooter_id; new.license_path := old.license_path;
  if coalesce(current_setting('app.payment_switch', true), '') <> '1' then  -- set only by switch_booking_to_gcash()
    new.payment_method := old.payment_method; new.gcash_reference := old.gcash_reference; new.payment_proof_path := old.payment_proof_path;
  end if;
  new.terms_agreed_at := old.terms_agreed_at; new.terms_snapshot := old.terms_snapshot;
  new.excess_hours := old.excess_hours; new.excess_fee := old.excess_fee; new.security_deposit := old.security_deposit;
  new.security_upfront := old.security_upfront; new.pay_now := old.pay_now;
  -- returned (even early): the scooter is free for new bookings from the moment it's checked back in
  if new.status = 'returned' and old.status is distinct from 'returned' then
    new.blocked_until := greatest(least(old.blocked_until, now()), old.pickup_at + interval '1 minute');
  end if;
  return new;
end $$;
