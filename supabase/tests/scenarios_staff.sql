-- Scenario tests for 0008_staff_accounts.sql: "Orders only" staff vs admin, deactivation.
\set ON_ERROR_STOP 1
update store_settings set open_time = '00:00', close_time = '00:00', is_open = true;

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

insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-000000000001', 'admin@t.test'),
  ('e0000000-0000-0000-0000-000000000002', 'barista@t.test'),
  ('e0000000-0000-0000-0000-000000000003', 'customer@t.test'),
  ('e0000000-0000-0000-0000-000000000004', 'rider@t.test');
update users set role = 'admin' where id = 'e0000000-0000-0000-0000-000000000001';
update users set role = 'staff' where id = 'e0000000-0000-0000-0000-000000000002';
update users set role = 'rider' where id = 'e0000000-0000-0000-0000-000000000004';
insert into riders (id, user_id, name, phone) values ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000004', 'Rico', '09170000004');
select pg_temp.check((select is_active from users where id = 'e0000000-0000-0000-0000-000000000002'), 'new logins are active by default');

set role anon;
create temp table o on commit preserve rows as
  select place_order('{"customer_name":"Ana","customer_phone":"09171112222","order_type":"pickup","payment_method":"cash"}',
                     '[{"menu_item_id":"30000000-0000-0000-0000-000000000013","quantity":1}]') r;
reset role; select set_config('request.jwt.claim.sub', '', false) \g /dev/null
grant select on o to authenticated;
create temp table ids on commit preserve rows as
  select (select id from orders limit 1) as order_id,
         (select id from item_options where is_active limit 1) as option_id;
grant select on ids to authenticated;

-- ---- staff (orders only) ----
set role authenticated; select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', false);
select pg_temp.check(is_staff() and not is_admin(), 'barista is staff, not admin');
select pg_temp.check((select count(*) from orders) = 1, 'staff sees the orders board');
select pg_temp.check((select count(*) from order_items) = 1, 'staff sees order lines');
select pg_temp.check((select count(*) from riders) >= 1 and (select count(*) from riders where id = 'e1000000-0000-0000-0000-000000000001') = 1, 'staff sees riders (to assign deliveries)');
update orders set status = 'preparing', rider_id = 'e1000000-0000-0000-0000-000000000001';
select pg_temp.check((select status::text from orders) = 'preparing', 'staff can accept / move orders and assign a rider');
update orders set total = 1, subtotal = 1;
select pg_temp.check((select total from orders) > 1, 'staff cannot change an order''s total (kept by the order trigger)');
select set_item_sold_out('30000000-0000-0000-0000-000000000013', true);
select pg_temp.check((select is_sold_out from menu_items where id = '30000000-0000-0000-0000-000000000013'), 'staff can mark an item sold out');
select set_item_sold_out('30000000-0000-0000-0000-000000000013', false);
select set_option_available((select option_id from ids), false);
select pg_temp.check(not (select is_active from item_options where id = (select option_id from ids)), 'staff can switch an option off (e.g. oat milk)');
select set_option_available((select option_id from ids), true);
update menu_items set price = 1 where id = '30000000-0000-0000-0000-000000000013';
select pg_temp.check((select price from menu_items where id = '30000000-0000-0000-0000-000000000013') <> 1, 'staff cannot change prices (no rows updated)');
update delivery_zones set fee = 0;
select pg_temp.check((select min(fee) from delivery_zones) > 0, 'staff cannot change delivery fees');
update store_settings set gcash_number = '09990000000';
select pg_temp.check((select gcash_number from store_settings) is distinct from '09990000000', 'staff cannot change settings');
select pg_temp.expect_error($q$select daily_summary()$q$, 'Admins only');
select pg_temp.check((select count(*) from users) = 1, 'staff only sees their own profile');
select pg_temp.expect_error($q$update users set role = 'admin' where id = 'e0000000-0000-0000-0000-000000000002'$q$, 'Only an admin');
reset role; select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select pg_temp.check((select role::text from users where id = 'e0000000-0000-0000-0000-000000000002') = 'staff', 'staff cannot promote themselves');

-- ---- deactivation ----
update users set is_active = false where id = 'e0000000-0000-0000-0000-000000000002';
set role authenticated; select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', false);
select pg_temp.check(not is_staff(), 'deactivated staff loses access at once');
select pg_temp.check((select count(*) from orders) = 0, 'deactivated staff sees no orders');
select pg_temp.expect_error($q$select set_item_sold_out('30000000-0000-0000-0000-000000000013', true)$q$, 'Staff only');
select pg_temp.expect_error($q$update users set is_active = true where id = 'e0000000-0000-0000-0000-000000000002'$q$, 'Only an admin');
reset role; select set_config('request.jwt.claim.sub', '', false) \g /dev/null

-- ---- customers / riders / admin ----
set role authenticated; select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000003', false);
select pg_temp.check(not is_staff(), 'customer is not staff');
select pg_temp.expect_error($q$select set_item_sold_out('30000000-0000-0000-0000-000000000013', true)$q$, 'Staff only');
select pg_temp.check((select count(*) from riders) = 0, 'customer cannot list riders');
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000004', false);
select pg_temp.check(not is_staff() and (select count(*) from orders) = 1, 'rider is not staff, still sees their assigned order');
select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);
select pg_temp.check(is_admin() and is_staff(), 'admin has every staff right');
update users set is_active = true where id = 'e0000000-0000-0000-0000-000000000002';
update users set role = 'admin' where id = 'e0000000-0000-0000-0000-000000000002';
reset role; select set_config('request.jwt.claim.sub', '', false) \g /dev/null
select pg_temp.check((select role::text || is_active::text from users where id = 'e0000000-0000-0000-0000-000000000002') = 'admintrue', 'admin can reactivate and promote staff');
update users set is_active = false where id = 'e0000000-0000-0000-0000-000000000001';
set role authenticated; select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', false);
select pg_temp.check(not is_admin(), 'a deactivated admin loses admin rights');
reset role; select set_config('request.jwt.claim.sub', '', false) \g /dev/null

select 'ALL STAFF SCENARIOS PASSED';
