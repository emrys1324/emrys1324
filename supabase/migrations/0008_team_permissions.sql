-- Team accounts with per-person permissions.
--
-- role 'admin' = full access (everything + managing the team).
-- role 'staff' = only the permissions ticked for them:
--   orders      orders board: accept, statuses, assign riders, verify GCash
--   stock       sold-out / option-available switches
--   open_close  open or close the store for orders
--   menu        items, prices, photos, categories, options
--   zones       delivery zones and fees
--   refunds     refund paid online orders
--   sales       sales summary
--   settings    store settings (hours, branding, GCash, payments switch)
-- role 'rider' = their deliveries (unchanged).
-- users.is_active = false switches a login off: it loses every right at once.

alter type public.user_role add value if not exists 'staff';

alter table public.users
  add column if not exists is_active   boolean not null default true,
  add column if not exists permissions text[]  not null default '{}';
alter table public.users drop constraint if exists users_permissions_known;
alter table public.users add constraint users_permissions_known
  check (permissions <@ array['orders','stock','open_close','menu','zones','refunds','sales','settings']::text[]);

-- NB: role::text comparisons — an enum value added in this migration can't be used as a literal yet.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role::text = 'admin' and is_active);
$$;

create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and is_active
                 and (role::text = 'admin' or (role::text = 'staff' and p = any (permissions))));
$$;
grant execute on function public.has_perm(text) to authenticated;

-- Only admins change roles, permissions or the active flag (nobody can raise their own access).
create or replace function public.guard_user_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active
      or new.permissions is distinct from old.permissions)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change roles, permissions or switch logins off';
  end if;
  return new;
end $$;

-- Catalogue writes by permission (reads stay public).
drop policy if exists "admin write" on public.store_settings;
create policy "settings write" on public.store_settings for all to authenticated
  using (public.has_perm('settings')) with check (public.has_perm('settings'));
drop policy if exists "admin write" on public.delivery_zones;
create policy "zones write" on public.delivery_zones for all to authenticated
  using (public.has_perm('zones')) with check (public.has_perm('zones'));
do $$
declare t text;
begin
  foreach t in array array['menu_categories', 'menu_items', 'option_groups', 'item_options', 'menu_item_option_groups'] loop
    execute format('drop policy if exists "admin write" on public.%I', t);
    execute format('create policy "menu write" on public.%I for all to authenticated using (public.has_perm(''menu'')) with check (public.has_perm(''menu''))', t);
  end loop;
end $$;

-- Orders board
drop policy if exists "orders read" on public.orders;
create policy "orders read" on public.orders for select to authenticated
  using (public.has_perm('orders') or customer_id = auth.uid() or rider_id = public.current_rider_id());
drop policy if exists "orders admin update" on public.orders;
create policy "orders staff update" on public.orders for update to authenticated
  using (public.has_perm('orders')) with check (public.has_perm('orders'));
drop policy if exists "order items read" on public.order_items;
create policy "order items read" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (public.has_perm('orders') or o.customer_id = auth.uid() or o.rider_id = public.current_rider_id())));
drop policy if exists "riders read" on public.riders;
create policy "riders read" on public.riders for select to authenticated
  using (public.has_perm('orders') or user_id = auth.uid());

-- Photos (menu items need "menu"; logo/background/GCash QR need "settings")
drop policy if exists "menu photos admin insert" on storage.objects;
drop policy if exists "menu photos admin update" on storage.objects;
drop policy if exists "menu photos admin delete" on storage.objects;
create policy "menu photos staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-photos' and (public.has_perm('menu') or public.has_perm('settings')));
create policy "menu photos staff update" on storage.objects for update to authenticated
  using (bucket_id = 'menu-photos' and (public.has_perm('menu') or public.has_perm('settings')));
create policy "menu photos staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'menu-photos' and (public.has_perm('menu') or public.has_perm('settings')));
drop policy if exists "payment proof admin read" on storage.objects;
create policy "payment proof staff read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.has_perm('orders'));

-- One-column switches (never prices)
create or replace function public.set_item_sold_out(p_item uuid, p_sold_out boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not (public.has_perm('stock') or public.has_perm('menu')) then raise exception 'Not allowed: sold-out switches'; end if;
  update public.menu_items set is_sold_out = p_sold_out where id = p_item;
  if not found then raise exception 'Item not found'; end if;
end $$;

create or replace function public.set_option_available(p_option uuid, p_available boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not (public.has_perm('stock') or public.has_perm('menu')) then raise exception 'Not allowed: sold-out switches'; end if;
  update public.item_options set is_active = p_available where id = p_option;
  if not found then raise exception 'Option not found'; end if;
end $$;

create or replace function public.set_store_open(p_open boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not (public.has_perm('open_close') or public.has_perm('settings')) then raise exception 'Not allowed: open/close the store'; end if;
  update public.store_settings set is_open = p_open where id = 1;
end $$;

revoke execute on function public.set_item_sold_out(uuid, boolean)    from public, anon;
revoke execute on function public.set_option_available(uuid, boolean) from public, anon;
revoke execute on function public.set_store_open(boolean)             from public, anon;
grant  execute on function public.set_item_sold_out(uuid, boolean)    to authenticated;
grant  execute on function public.set_option_available(uuid, boolean) to authenticated;
grant  execute on function public.set_store_open(boolean)             to authenticated;

-- Sales summary by permission (body unchanged from 0005 apart from the check)
create or replace function public.daily_summary(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz     text := (select timezone from public.store_settings where id = 1);
  d      date;
  result jsonb;
begin
  if not public.has_perm('sales') then raise exception 'Not allowed: sales summary'; end if;
  d := coalesce(p_date, (now() at time zone tz)::date);

  with day_orders as (
    select * from public.orders
    where (created_at at time zone tz)::date = d
      and not (payment_method = 'online' and paid_at is null)  -- abandoned online checkouts
  ), valid as (
    select * from day_orders where status <> 'cancelled'
  )
  select jsonb_build_object(
    'date', d,
    'orders', (select count(*) from day_orders),
    'completed', (select count(*) from day_orders where status = 'completed'),
    'cancelled', (select count(*) from day_orders where status = 'cancelled'),
    'open', (select count(*) from day_orders where status not in ('completed', 'cancelled')),
    'sales', (select coalesce(sum(total), 0) from valid),
    'delivery_fees', (select coalesce(sum(delivery_fee), 0) from valid),
    'average', (select coalesce(round(avg(total), 2), 0) from valid),
    'top_items', coalesce((
      select jsonb_agg(t order by t.qty desc, t.sales desc) from (
        select i.item_name as name, sum(i.quantity)::int as qty, sum(i.line_total) as sales
        from public.order_items i join valid v on v.id = i.order_id
        group by i.item_name order by qty desc, sales desc limit 5
      ) t), '[]'::jsonb),
    'by_type', coalesce((
      select jsonb_agg(t order by t.sales desc) from (
        select order_type, count(*)::int as orders, sum(total) as sales
        from valid group by order_type
      ) t), '[]'::jsonb),
    'by_payment', coalesce((
      select jsonb_agg(t) from (
        select payment_method, count(*)::int as orders, sum(total) as sales
        from valid group by payment_method
      ) t), '[]'::jsonb)
  ) into result;
  return result;
end $$;


-- Last-admin safety for self-deletion counts active admins only.
create or replace function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.users where id = v_uid and role::text = 'admin' and is_active)
     and (select count(*) from public.users where role::text = 'admin' and is_active) <= 1 then
    raise exception 'You are the only admin. Make another staff member an admin before deleting this account.';
  end if;
  update public.riders set is_active = false where user_id = v_uid;
  delete from auth.users where id = v_uid;  -- cascades to public.users, push_tokens
end $$;
