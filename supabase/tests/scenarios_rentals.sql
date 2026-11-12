-- Scenario tests for 0011_scooter_rentals.sql
\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then
    if position(needle in sqlerrm) = 0 then raise exception 'Wrong error. Expected "%", got "%"', needle, sqlerrm; end if;
    raise notice 'ok (rejected): %', sqlerrm; return;
  end;
  raise exception 'FAIL: statement should have been rejected: %', sql;
end $$;
create or replace function pg_temp.check(ok boolean, msg text) returns text language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', msg; end if; return 'ok ' || msg; end $$;
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', uid, false); end $$;

insert into scooters (id, name, daily_rate) values
  ('a1000000-0000-0000-0000-000000000001', 'Honda Click 125', 500),
  ('a1000000-0000-0000-0000-000000000002', 'Yamaha Mio', 400);
update rental_settings set deposit_percent = 30, security_deposit = 2000, delivery_fee = 150, max_days = 14;
create temp table d as select (now() at time zone 'Asia/Manila')::date + 3 as day0;
grant select on d to anon, authenticated;
create or replace function pg_temp.req(scooter text, s int, e int, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('scooter_id', scooter, 'start_date', (select day0 from d) + s, 'end_date', (select day0 from d) + e,
    'customer_name', 'Ana Reyes', 'customer_phone', '+63 917 111 2222', 'helmets', 2, 'license_path', 'licenses/ana.jpg') || extra
$$;

-- closed by default
set role anon;
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', 0, 2))$q$, 'CLOSED');
reset role;
update rental_settings set bookings_enabled = true;

-- happy path: 2 days × ₱500 + ₱150 delivery = ₱1,150; deposit 30% = ₱345
set role anon;
create temp table b1 on commit preserve rows as
  select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', 0, 2, '{"delivery": true, "delivery_address": "Romblon Beach Resort, Room 4", "customer_email": "ana@example.com"}')) r;
reset role;
select pg_temp.check((select (r->>'total')::numeric = 1150 and (r->>'deposit')::numeric = 345 and r->>'booking_number' like 'BY-%' from b1), 'server prices it: 2 days × ₱500 + ₱150 delivery = ₱1,150; 30% deposit ₱345');
select pg_temp.check((select customer_phone = '09171112222' and status = 'awaiting_deposit' and payment_status = 'awaiting_payment' and security_deposit = 2000 and helmets = 2
                      and payment_expires_at between now() + interval '29 minutes' and now() + interval '31 minutes'
                      from rental_bookings where public_token = (select (r->>'token')::uuid from b1)), 'booking held for 30 minutes awaiting the deposit; phone normalised; security deposit copied');

-- same-day = 1 day; return day frees the scooter for the next pickup
set role anon;
select pg_temp.check((book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', 2, 2))->>'total')::numeric = 500, 'pickup on the return day of another booking is allowed; same-day return = 1 day');
-- overlaps refused
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', 1, 3))$q$, 'UNAVAILABLE');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', -0, 1))$q$, 'UNAVAILABLE');
select pg_temp.check((book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 0, 2))->>'total')::numeric = 800, 'another scooter on the same days is fine');

-- validation
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', -5, -4))$q$, 'pickup date has passed');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 6, 5))$q$, 'return date');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 10, 30))$q$, 'up to 14 days');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 10, 11, '{"customer_phone": "12345"}'))$q$, '09XXXXXXXXX');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 10, 11, '{"helmets": 3}'))$q$, 'helmets');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 10, 11, '{"delivery": true}'))$q$, 'delivery address');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 10, 11, '{"license_path": null}'))$q$, 'license');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 10, 11, '{"license_path": "../etc/passwd"}'))$q$, 'license');
select pg_temp.expect_error($q$insert into rental_bookings (scooter_id, scooter_name, customer_name, customer_phone, start_date, end_date, days, daily_rate, total, deposit_amount, license_path) values ('a1000000-0000-0000-0000-000000000002','x','x','09171112222',current_date,current_date,1,1,1,1,'licenses/x')$q$, 'row-level security');

-- guests: no table access, status by link, calendar without personal details
select pg_temp.check((select count(*) from rental_bookings) = 0, 'guests cannot read bookings');
select pg_temp.check(get_booking_by_token((select (r->>'token')::uuid from b1))->>'status' = 'awaiting_deposit', 'booking status by its secret link');
select pg_temp.check((select count(*) from scooter_bookings_between((select day0 from d), (select day0 from d) + 5) where scooter_id = 'a1000000-0000-0000-0000-000000000001') = 2, 'calendar lists taken days per scooter');
select pg_temp.expect_error($q$select mark_booking_paid('x', 'y', 1)$q$, 'permission denied');
reset role;

-- expired holds free the days
update rental_bookings set payment_expires_at = now() - interval '1 minute' where scooter_id = 'a1000000-0000-0000-0000-000000000002';
create temp table t2 as select public_token from rental_bookings where scooter_id = 'a1000000-0000-0000-0000-000000000002' limit 1;
grant select on t2 to anon;
set role anon;
select pg_temp.check(get_booking_by_token((select public_token from t2))->>'status' = 'cancelled', 'an unpaid hold shows as cancelled once its 30 minutes pass');
select pg_temp.check((select count(*) from scooter_bookings_between((select day0 from d), (select day0 from d) + 5) where scooter_id = 'a1000000-0000-0000-0000-000000000002') = 0, 'expired holds no longer block the calendar');
select pg_temp.check((book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 0, 1))->>'total')::numeric = 400, 'expired hold is released when someone else books those days');
reset role;
select pg_temp.check((select cancel_reason from rental_bookings where scooter_id = 'a1000000-0000-0000-0000-000000000002' and status = 'cancelled' limit 1) like 'The deposit was not paid%', 'expired hold cancelled with a reason');

-- deposit confirmed by the server (service role)
update rental_bookings set gateway_ref = 'pr_b1' where public_token = (select (r->>'token')::uuid from b1);
set role service_role;
select pg_temp.check(mark_booking_paid('pr_b1', 'pay_1', 100) = 'amount_mismatch', 'wrong deposit amount refused');
select pg_temp.check(mark_booking_paid('pr_b1', 'pay_1', 34500) = 'paid', 'correct deposit (₱345) confirms the booking');
select pg_temp.check(mark_booking_paid('pr_b1', 'pay_1', 34500) = 'already_paid', 'duplicate notification harmless');
reset role;
select pg_temp.check((select status = 'confirmed' and payment_status = 'deposit_paid' and deposit_paid_at is not null from rental_bookings where gateway_ref = 'pr_b1'), 'booking confirmed, deposit paid');

-- staff with the rentals permission manage bookings; others can't
insert into auth.users (id, email) values ('b0000000-0000-0000-0000-000000000001', 'renter@t.test'), ('b0000000-0000-0000-0000-000000000002', 'barista@t.test');
update users set role = 'staff', permissions = '{rentals}' where id = 'b0000000-0000-0000-0000-000000000001';
update users set role = 'staff', permissions = '{orders}'  where id = 'b0000000-0000-0000-0000-000000000002';
set role authenticated; select pg_temp.as_user('b0000000-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from rental_bookings) = 0, 'staff without the Rentals permission see no bookings');
update scooters set daily_rate = 1;
select pg_temp.check((select min(daily_rate) from scooters) > 1, '…and cannot change scooter prices');
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from rental_bookings) >= 3, 'Rentals permission: sees bookings');
update rental_bookings set status = 'picked_up', total = 1 where gateway_ref = 'pr_b1';
select pg_temp.check((select status = 'picked_up' and picked_up_at is not null and total = 1150 from rental_bookings where gateway_ref = 'pr_b1'), 'marks picked up (time stamped); price stays locked');
select pg_temp.expect_error($q$update rental_bookings set status = 'cancelled' where gateway_ref = 'pr_b1'$q$, 'check');
update scooters set daily_rate = 550 where id = 'a1000000-0000-0000-0000-000000000001';
update rental_settings set deposit_percent = 50;
reset role; select pg_temp.as_user('');
select pg_temp.check((select daily_rate from scooters where id = 'a1000000-0000-0000-0000-000000000001') = 550 and (select deposit_percent from rental_settings) = 50, 'Rentals permission: edits scooter prices and rental settings');
select pg_temp.check((select total from rental_bookings where gateway_ref = 'pr_b1') = 1150, 'price changes never affect existing bookings');

select 'ALL RENTAL SCENARIOS PASSED';
