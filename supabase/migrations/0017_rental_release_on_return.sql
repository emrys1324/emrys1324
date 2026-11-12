-- When staff mark a scooter as returned, it is open for booking again right away — instead of staying
-- blocked until the scheduled return time plus the turnaround gap. (Staff mark it returned once it's
-- checked and ready, so no extra gap is added.)

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
  new.payment_method := old.payment_method; new.gcash_reference := old.gcash_reference; new.payment_proof_path := old.payment_proof_path;
  new.terms_agreed_at := old.terms_agreed_at; new.terms_snapshot := old.terms_snapshot;
  -- returned (even early): the scooter is free for new bookings from the moment it's checked back in
  if new.status = 'returned' and old.status is distinct from 'returned' then
    new.blocked_until := greatest(least(old.blocked_until, now()), old.pickup_at + interval '1 minute');
  end if;
  return new;
end $$;

-- the hold may now end before the scheduled return (early return); it must still end after pickup
alter table public.rental_bookings drop constraint if exists rental_times_order;
alter table public.rental_bookings add constraint rental_times_order
  check (return_at > pickup_at and blocked_until > pickup_at and (blocked_until >= return_at or status = 'returned'));

-- free scooters of bookings that were already marked returned before this change
alter table public.rental_bookings disable trigger rental_bookings_touch;
update public.rental_bookings
   set blocked_until = greatest(least(blocked_until, coalesce(returned_at, now())), pickup_at + interval '1 minute')
 where status = 'returned' and blocked_until > greatest(coalesce(returned_at, now()), pickup_at + interval '1 minute');
alter table public.rental_bookings enable trigger rental_bookings_touch;
