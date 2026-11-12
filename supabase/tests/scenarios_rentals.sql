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
update rental_settings set deposit_percent = 30, security_deposit = 2000, delivery_fee = 150, max_days = 14, grace_minutes = 60, turnaround_minutes = 30;
create temp table d as select ((now() at time zone 'Asia/Manila')::date + 3 + time '09:00') as t0;  -- Manila local 9:00 AM, 3 days ahead
grant select on d to anon, authenticated;
-- times as hours after t0
create or replace function pg_temp.at(h numeric) returns text language sql as $$ select to_char((select t0 from d) + make_interval(secs => h * 3600), 'YYYY-MM-DD"T"HH24:MI') $$;
create or replace function pg_temp.req(scooter text, s numeric, e numeric, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('scooter_id', scooter, 'pickup_at', pg_temp.at(s), 'return_at', pg_temp.at(e),
    'customer_name', 'Ana Reyes', 'customer_phone', '+63 917 111 2222', 'helmets', 2, 'license_path', 'licenses/ana.jpg') || extra
$$;

-- closed by default
set role anon;
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', 0, 48))$q$, 'CLOSED');
reset role;
update rental_settings set bookings_enabled = true;

-- happy path: 48 hours = 2 days × ₱500 + ₱150 delivery = ₱1,150; deposit 30% = ₱345
set role anon;
create temp table b1 on commit preserve rows as
  select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', 0, 48, '{"delivery": true, "delivery_address": "Romblon Beach Resort, Room 4", "customer_email": "ana@example.com"}')) r;
reset role;
select pg_temp.check((select (r->>'total')::numeric = 1150 and (r->>'deposit')::numeric = 345 and (r->>'days')::int = 2 and r->>'booking_number' like 'BY-%' from b1), 'server prices it: 48 h = 2 days × ₱500 + ₱150 delivery = ₱1,150; 30% deposit ₱345');
select pg_temp.check((select customer_phone = '09171112222' and status = 'awaiting_deposit' and security_deposit = 2000
                      and to_char(pickup_at at time zone 'Asia/Manila', 'HH24:MI') = '09:00'
                      and blocked_until = return_at + interval '30 minutes'
                      and payment_expires_at between now() + interval '29 minutes' and now() + interval '31 minutes'
                      from rental_bookings where public_token = (select (r->>'token')::uuid from b1)), 'times stored (9:00 AM Manila), blocked until return + 30-min turnaround; 30-min hold for the deposit');

-- 24-hour blocks with a 60-minute grace period (Yamaha, far apart so they don't overlap)
set role anon;
select pg_temp.check((book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 100, 108))->>'days')::int = 1, '8 hours (same day) = 1 day');
select pg_temp.check((book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 120, 144.5))->>'days')::int = 1, '24.5 hours = 1 day (inside the 60-min grace)');
select pg_temp.check((book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 200, 226))->>'days')::int = 2, '26 hours = 2 days (past the grace)');

-- back-to-back on the same scooter respects return time + turnaround
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', 47, 50))$q$, 'UNAVAILABLE');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', 48, 52))$q$, 'UNAVAILABLE');
select pg_temp.check((book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', 48.5, 56))->>'days')::int = 1, 'next pickup allowed 30 min after the return (turnaround)');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000001', -10, 1))$q$, 'UNAVAILABLE');
select pg_temp.check((select count(*) from busy_scooters(((select t0 from d) + interval '10 hours') at time zone 'Asia/Manila', ((select t0 from d) + interval '12 hours') at time zone 'Asia/Manila')) = 1, 'busy_scooters lists only the scooter taken in that window');
select pg_temp.check((select count(*) from busy_scooters(((select t0 from d) + interval '60 hours') at time zone 'Asia/Manila', ((select t0 from d) + interval '70 hours') at time zone 'Asia/Manila')) = 0, '…and none when both are free');

-- validation
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 300.25, 310))$q$, 'hour or half hour');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', -100, -90))$q$, 'pickup time has passed');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 300, 300.5))$q$, 'at least 1 hour');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 300, 700))$q$, 'up to 14 days');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 300, 310, '{"pickup_at": "not a time"}'))$q$, 'pickup and return times');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 300, 310, '{"customer_phone": "12345"}'))$q$, '09XXXXXXXXX');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 300, 310, '{"helmets": 3}'))$q$, 'helmets');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 300, 310, '{"delivery": true}'))$q$, 'delivery address');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 300, 310, '{"license_path": null}'))$q$, 'license');
select pg_temp.expect_error($q$select book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 300, 310, '{"license_path": "../etc/passwd"}'))$q$, 'license');
select pg_temp.expect_error($q$insert into rental_bookings (scooter_id, scooter_name, customer_name, customer_phone, start_date, end_date, pickup_at, return_at, blocked_until, days, daily_rate, total, deposit_amount, license_path) values ('a1000000-0000-0000-0000-000000000002','x','x','09171112222',current_date,current_date,now(),now()+interval '2 hours',now()+interval '2 hours',1,1,1,1,'licenses/x')$q$, 'row-level security');

-- guests: no table access, status by link, calendar without personal details
select pg_temp.check((select count(*) from rental_bookings) = 0, 'guests cannot read bookings');
select pg_temp.check(get_booking_by_token((select (r->>'token')::uuid from b1))->>'status' = 'awaiting_deposit', 'booking status by its secret link');
select pg_temp.check((select count(*) from scooter_bookings_between((select t0 from d)::date, (select t0 from d)::date + 5) where scooter_id = 'a1000000-0000-0000-0000-000000000001') = 2, 'calendar (older screens) lists taken days per scooter');
select pg_temp.expect_error($q$select mark_booking_paid('x', 'y', 1)$q$, 'permission denied');
reset role;

-- expired holds free the days
update rental_bookings set payment_expires_at = now() - interval '1 minute' where scooter_id = 'a1000000-0000-0000-0000-000000000002';
create temp table t2 as select public_token from rental_bookings where scooter_id = 'a1000000-0000-0000-0000-000000000002' limit 1;
grant select on t2 to anon;
set role anon;
select pg_temp.check(get_booking_by_token((select public_token from t2))->>'status' = 'cancelled', 'an unpaid hold shows as cancelled once its 30 minutes pass');
select pg_temp.check((select count(*) from busy_scooters(((select t0 from d) + interval '100 hours') at time zone 'Asia/Manila', ((select t0 from d) + interval '230 hours') at time zone 'Asia/Manila')) = 0, 'expired holds no longer block those times');
select pg_temp.check((book_scooter(pg_temp.req('a1000000-0000-0000-0000-000000000002', 100, 124))->>'total')::numeric = 400, 'expired hold is released when someone else books those times');
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
