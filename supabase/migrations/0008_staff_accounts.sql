-- Staff accounts: an "Orders only" staff role next to full admins, plus an
-- active flag so a login can be switched off without losing order history.
--
-- staff  = orders board (accept, statuses, assign riders, verify GCash),
--          sold-out / option-available switches. No prices, zones, settings,
--          refunds or sales summary.
-- admin  = everything (unchanged).
-- Deactivated users (is_active = false) lose staff/admin rights immediately.

alter type public.user_role add value if not exists 'staff';

alter table public.users
  add column if not exists is_active boolean not null default true;

-- NB: role::text comparisons — an enum value added in this same migration
-- can't be referenced as a literal of the enum type yet.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role::text = 'admin' and is_active);
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role::text in ('admin', 'staff') and is_active);
$$;
grant execute on function public.is_staff() to authenticated;

-- Only admins change roles or the active flag (a deactivated user can't re-activate themselves).
create or replace function public.guard_user_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change roles or deactivate accounts';
  end if;
  return new;
end $$;

-- Orders board: staff read + update orders (prices/numbers stay locked by the existing trigger).
drop policy if exists "orders read" on public.orders;
create policy "orders read" on public.orders for select to authenticated
  using (public.is_staff() or customer_id = auth.uid() or rider_id = public.current_rider_id());
drop policy if exists "orders admin update" on public.orders;
create policy "orders staff update" on public.orders for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop policy if exists "order items read" on public.order_items;
create policy "order items read" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (public.is_staff() or o.customer_id = auth.uid() or o.rider_id = public.current_rider_id())));

-- Riders list for the "assign rider" dropdown (writes stay admin-only).
drop policy if exists "riders read" on public.riders;
create policy "riders read" on public.riders for select to authenticated
  using (public.is_staff() or user_id = auth.uid());

-- GCash screenshots: staff verify payments.
drop policy if exists "payment proof admin read" on storage.objects;
create policy "payment proof staff read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_staff());

-- Sold-out / available switches for staff (one column each — never prices).
create or replace function public.set_item_sold_out(p_item uuid, p_sold_out boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  update public.menu_items set is_sold_out = p_sold_out where id = p_item;
  if not found then raise exception 'Item not found'; end if;
end $$;

create or replace function public.set_option_available(p_option uuid, p_available boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only'; end if;
  update public.item_options set is_active = p_available where id = p_option;
  if not found then raise exception 'Option not found'; end if;
end $$;

revoke execute on function public.set_item_sold_out(uuid, boolean)    from public, anon;
revoke execute on function public.set_option_available(uuid, boolean) from public, anon;
grant  execute on function public.set_item_sold_out(uuid, boolean)    to authenticated;
grant  execute on function public.set_option_available(uuid, boolean) to authenticated;

-- Last-admin safety for self-deletion now counts active admins only.
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
