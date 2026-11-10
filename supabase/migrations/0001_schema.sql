-- =====================================================================
-- Pahuway Cafe — schema, security (RLS), business rules, realtime
-- Run once on a fresh Supabase project (SQL editor or `supabase db push`).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------------------------------------------------
create type public.user_role      as enum ('customer', 'admin', 'rider');
create type public.order_type     as enum ('pickup', 'delivery', 'dine_in');
create type public.order_status   as enum ('received', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled');
create type public.payment_method as enum ('cash', 'gcash');
create type public.payment_status as enum ('unpaid', 'for_verification', 'paid');
create type public.option_selection as enum ('single', 'multi');

-- ---------- Store settings (single row) ------------------------------
create table public.store_settings (
  id                  int primary key default 1 check (id = 1),
  store_name          text not null default 'Pahuway Cafe',
  is_open             boolean not null default true,       -- manual open/closed switch
  open_time           time not null default '09:00',
  close_time          time not null default '23:30',       -- may be earlier than open_time (past midnight)
  timezone            text not null default 'Asia/Manila',
  min_delivery_order  numeric(10,2) not null default 200 check (min_delivery_order >= 0),
  prep_minutes        int not null default 15 check (prep_minutes between 5 and 120),
  closed_message      text not null default 'We''re taking a little pahuway (rest). Please come back during opening hours!',
  gcash_name          text,
  gcash_number        text,
  gcash_qr_url        text,
  updated_at          timestamptz not null default now()
);

-- ---------- Delivery zones -------------------------------------------
create table public.delivery_zones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  fee         numeric(10,2) not null default 0 check (fee >= 0),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Users (profile + role; 1:1 with auth.users) --------------
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'customer',
  full_name   text,
  phone       text,
  email       text,
  zone_id     uuid references public.delivery_zones (id) on delete set null,
  street      text,
  landmark    text,
  created_at  timestamptz not null default now()
);

-- ---------- Riders ----------------------------------------------------
create table public.riders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references public.users (id) on delete set null,
  name        text not null,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Menu ------------------------------------------------------
create table public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.menu_items (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.menu_categories (id) on delete restrict,
  name         text not null,
  description  text,
  price        numeric(10,2) not null check (price >= 0),
  photo_url    text,
  is_sold_out  boolean not null default false,
  is_active    boolean not null default true,  -- false = hidden from menu
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index on public.menu_items (category_id);

-- Reusable option groups, e.g. "Temperature", "Sugar level", "Add-ons"
create table public.option_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  selection   public.option_selection not null default 'single',
  is_required boolean not null default false,
  max_select  int check (max_select is null or max_select > 0),  -- for multi; null = unlimited
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- Choices inside a group, e.g. "Iced (+₱10)"
create table public.item_options (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.option_groups (id) on delete cascade,
  name         text not null,
  price_delta  numeric(10,2) not null default 0,
  is_default   boolean not null default false,
  is_active    boolean not null default true,
  sort_order   int not null default 0
);
create index on public.item_options (group_id);

-- Which groups apply to which item
create table public.menu_item_option_groups (
  item_id     uuid not null references public.menu_items (id) on delete cascade,
  group_id    uuid not null references public.option_groups (id) on delete cascade,
  sort_order  int not null default 0,
  primary key (item_id, group_id)
);

-- ---------- Orders ----------------------------------------------------
create sequence public.order_number_seq start 1;

create or replace function public.next_order_number() returns text
language sql volatile as $$
  select 'PH-' || lpad(n::text, greatest(4, length(n::text)), '0')
  from (select nextval('public.order_number_seq') as n) s;
$$;

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique default public.next_order_number(),
  public_token        uuid not null unique default gen_random_uuid(),  -- secret for the shareable status link
  customer_id         uuid references public.users (id) on delete set null,  -- null = guest
  customer_name       text not null,
  customer_phone      text not null check (customer_phone ~ '^09[0-9]{9}$'),
  order_type          public.order_type not null,
  status              public.order_status not null default 'received',
  scheduled_for       timestamptz,          -- null = ASAP
  zone_id             uuid references public.delivery_zones (id) on delete set null,
  zone_name           text,                 -- snapshot, survives zone rename/delete
  street              text,
  landmark            text,
  rider_notes         text,
  subtotal            numeric(10,2) not null,
  delivery_fee        numeric(10,2) not null default 0,
  total               numeric(10,2) not null,
  payment_method      public.payment_method not null,
  payment_status      public.payment_status not null default 'unpaid',
  gcash_reference     text,
  payment_proof_path  text,                 -- path inside the private "payment-proofs" bucket
  rider_id            uuid references public.riders (id) on delete set null,
  cancel_reason       text,
  accepted_at         timestamptz,
  ready_at            timestamptz,
  picked_up_at        timestamptz,
  completed_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint cancel_needs_reason check (status <> 'cancelled' or coalesce(trim(cancel_reason), '') <> ''),
  constraint delivery_needs_zone check (order_type <> 'delivery' or zone_id is not null or zone_name is not null)
);
create index on public.orders (status);
create index on public.orders (created_at desc);
create index on public.orders (rider_id);
create index on public.orders (customer_id);

create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  menu_item_id   uuid references public.menu_items (id) on delete set null,
  item_name      text not null,              -- snapshot
  base_price     numeric(10,2) not null,
  options        jsonb not null default '[]', -- [{group, name, price_delta}]
  options_total  numeric(10,2) not null default 0,
  unit_price     numeric(10,2) not null,
  quantity       int not null check (quantity between 1 and 50),
  notes          text,
  line_total     numeric(10,2) not null
);
create index on public.order_items (order_id);

-- =====================================================================
-- Helper functions
-- =====================================================================
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

create or replace function public.current_rider_id() returns uuid
language sql stable security definer set search_path = public as $$
  select r.id from public.riders r
  join public.users u on u.id = r.user_id
  where r.user_id = auth.uid() and u.role = 'rider' and r.is_active
  limit 1;
$$;

-- True when the time-of-day falls inside opening hours (handles past-midnight closing).
create or replace function public.within_hours(t time, open_t time, close_t time) returns boolean
language sql immutable as $$
  select case
    when close_t > open_t then t >= open_t and t < close_t
    else t >= open_t or t < close_t
  end;
$$;

create or replace function public.store_is_open_now() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare s public.store_settings;
begin
  select * into s from public.store_settings where id = 1;
  if not found or not s.is_open then return false; end if;
  return public.within_hours((now() at time zone s.timezone)::time, s.open_time, s.close_time);
end $$;

-- =====================================================================
-- Triggers
-- =====================================================================

-- New sign-up → profile row (role = customer)
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, full_name, phone, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'phone', new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Users can edit their own profile but never their own role.
create or replace function public.guard_user_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an admin can change roles';
  end if;
  return new;
end $$;

create trigger users_guard_role
  before update on public.users
  for each row execute function public.guard_user_role();

-- Status change bookkeeping: timestamps, COD auto-paid on completion.
create or replace function public.orders_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    case new.status
      when 'preparing'        then new.accepted_at  := coalesce(new.accepted_at, now());
      when 'ready'            then new.ready_at     := coalesce(new.ready_at, now());
      when 'out_for_delivery' then new.picked_up_at := coalesce(new.picked_up_at, now());
      when 'completed'        then
        new.completed_at := coalesce(new.completed_at, now());
        if new.payment_method = 'cash' then new.payment_status := 'paid'; end if;
      when 'cancelled'        then new.cancelled_at := coalesce(new.cancelled_at, now());
      else null;
    end case;
  end if;
  -- Customer-facing fields are frozen once the order exists.
  new.public_token   := old.public_token;
  new.order_number   := old.order_number;
  new.subtotal       := old.subtotal;
  new.total          := old.total;
  new.delivery_fee   := old.delivery_fee;
  return new;
end $$;

create trigger orders_before_update
  before update on public.orders
  for each row execute function public.orders_before_update();

-- Push a lightweight status event to the order's public channel so the guest
-- status page updates instantly (guests can't read the orders table directly).
create or replace function public.orders_broadcast() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform realtime.send(
      jsonb_build_object('status', new.status, 'payment_status', new.payment_status, 'updated_at', new.updated_at),
      'status',
      'order-' || new.public_token::text,
      false
    );
  exception when others then
    null;  -- never block an order update because realtime is unavailable
  end;
  return null;
end $$;

create trigger orders_broadcast
  after insert or update on public.orders
  for each row execute function public.orders_broadcast();

create or replace function public.touch_settings() returns trigger
language plpgsql as $$ begin new.updated_at := now(); new.id := 1; return new; end $$;

create trigger store_settings_touch
  before update on public.store_settings
  for each row execute function public.touch_settings();

-- =====================================================================
-- RPC: place an order (guest or signed-in customer)
-- All prices are recomputed here; the browser's numbers are never trusted.
-- =====================================================================
create or replace function public.place_order(p_order jsonb, p_items jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  s              public.store_settings;
  v_name         text := trim(coalesce(p_order ->> 'customer_name', ''));
  v_phone        text := regexp_replace(coalesce(p_order ->> 'customer_phone', ''), '[\s\-()]', '', 'g');
  v_type         public.order_type;
  v_pay          public.payment_method;
  v_sched        timestamptz;
  v_zone         public.delivery_zones;
  v_street       text := nullif(trim(coalesce(p_order ->> 'street', '')), '');
  v_landmark     text := nullif(trim(coalesce(p_order ->> 'landmark', '')), '');
  v_rider_notes  text := nullif(trim(coalesce(p_order ->> 'rider_notes', '')), '');
  v_ref          text := nullif(trim(coalesce(p_order ->> 'gcash_reference', '')), '');
  v_proof        text := nullif(trim(coalesce(p_order ->> 'payment_proof_path', '')), '');
  v_line         jsonb;
  v_item         public.menu_items;
  v_qty          int;
  v_notes        text;
  v_opt_ids      uuid[];
  v_opts         jsonb;
  v_opts_total   numeric(10,2);
  v_subtotal     numeric(10,2) := 0;
  v_fee          numeric(10,2) := 0;
  v_lines        jsonb := '[]'::jsonb;
  v_grp          record;
  v_count        int;
  v_order        public.orders;
begin
  select * into s from public.store_settings where id = 1;

  if not public.store_is_open_now() then
    raise exception 'STORE_CLOSED: %', s.closed_message;
  end if;

  -- Customer details
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'INVALID: Please enter your name.';
  end if;
  if v_phone ~ '^\+639[0-9]{9}$' then v_phone := '0' || substr(v_phone, 4);
  elsif v_phone ~ '^639[0-9]{9}$' then v_phone := '0' || substr(v_phone, 3);
  end if;
  if v_phone !~ '^09[0-9]{9}$' then
    raise exception 'INVALID: Mobile number must look like 09XXXXXXXXX.';
  end if;

  begin
    v_type := (p_order ->> 'order_type')::public.order_type;
    v_pay  := (p_order ->> 'payment_method')::public.payment_method;
  exception when others then
    raise exception 'INVALID: Please choose an order type and payment method.';
  end;
  if v_type is null or v_pay is null then
    raise exception 'INVALID: Please choose an order type and payment method.';
  end if;

  -- Schedule (null = ASAP)
  if nullif(p_order ->> 'scheduled_for', '') is not null then
    v_sched := (p_order ->> 'scheduled_for')::timestamptz;
    if v_sched < now() + interval '10 minutes' or v_sched > now() + interval '18 hours'
       or not public.within_hours((v_sched at time zone s.timezone)::time, s.open_time, s.close_time) then
      raise exception 'INVALID: That pickup/delivery time is no longer available. Please choose another slot.';
    end if;
  end if;

  -- Items
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID: Your cart is empty.';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID: Too many items in one order.';
  end if;

  for v_line in select * from jsonb_array_elements(p_items) loop
    select * into v_item from public.menu_items where id = (v_line ->> 'menu_item_id')::uuid;
    if not found or not v_item.is_active then
      raise exception 'ITEM_UNAVAILABLE: An item in your cart is no longer on the menu.';
    end if;
    if v_item.is_sold_out then
      raise exception 'ITEM_UNAVAILABLE: Sorry, % just sold out. Please remove it from your cart.', v_item.name;
    end if;

    v_qty := coalesce((v_line ->> 'quantity')::int, 0);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'INVALID: Quantity for % must be between 1 and 50.', v_item.name;
    end if;
    v_notes := nullif(left(trim(coalesce(v_line ->> 'notes', '')), 200), '');

    select coalesce(array_agg(distinct x::uuid), '{}') into v_opt_ids
    from jsonb_array_elements_text(coalesce(v_line -> 'option_ids', '[]'::jsonb)) x;

    -- every chosen option must be active and belong to a group attached to this item
    select count(*) into v_count
    from public.item_options o
    join public.menu_item_option_groups mg on mg.group_id = o.group_id and mg.item_id = v_item.id
    where o.id = any (v_opt_ids) and o.is_active;
    if v_count <> coalesce(array_length(v_opt_ids, 1), 0) then
      raise exception 'INVALID: Some options for % are no longer available. Please re-add it.', v_item.name;
    end if;

    -- per-group rules
    for v_grp in
      select g.*, (select count(*) from public.item_options o where o.group_id = g.id and o.id = any (v_opt_ids)) as picked,
                  (select count(*) from public.item_options o where o.group_id = g.id and o.is_active) as available
      from public.option_groups g
      join public.menu_item_option_groups mg on mg.group_id = g.id and mg.item_id = v_item.id
    loop
      if v_grp.selection = 'single' and v_grp.picked > 1 then
        raise exception 'INVALID: Choose only one % for %.', lower(v_grp.name), v_item.name;
      end if;
      if v_grp.is_required and v_grp.available > 0 and v_grp.picked = 0 then
        raise exception 'INVALID: Please choose a % for %.', lower(v_grp.name), v_item.name;
      end if;
      if v_grp.selection = 'multi' and v_grp.max_select is not null and v_grp.picked > v_grp.max_select then
        raise exception 'INVALID: Choose up to % % for %.', v_grp.max_select, lower(v_grp.name), v_item.name;
      end if;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object('group', g.name, 'name', o.name, 'price_delta', o.price_delta)
                              order by g.sort_order, o.sort_order), '[]'::jsonb),
           coalesce(sum(o.price_delta), 0)
      into v_opts, v_opts_total
    from public.item_options o join public.option_groups g on g.id = o.group_id
    where o.id = any (v_opt_ids);

    v_subtotal := v_subtotal + (v_item.price + v_opts_total) * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'menu_item_id', v_item.id, 'item_name', v_item.name, 'base_price', v_item.price,
      'options', v_opts, 'options_total', v_opts_total, 'unit_price', v_item.price + v_opts_total,
      'quantity', v_qty, 'notes', v_notes, 'line_total', (v_item.price + v_opts_total) * v_qty);
  end loop;

  -- Delivery rules
  if v_type = 'delivery' then
    select * into v_zone from public.delivery_zones where id = nullif(p_order ->> 'zone_id', '')::uuid and is_active;
    if not found then
      raise exception 'INVALID: Please choose a barangay we deliver to.';
    end if;
    if v_street is null then
      raise exception 'INVALID: Please enter your street or landmark so our rider can find you.';
    end if;
    if v_subtotal < s.min_delivery_order then
      raise exception 'MIN_ORDER: Minimum order for delivery is ₱%.', to_char(s.min_delivery_order, 'FM999,990');
    end if;
    v_fee := v_zone.fee;
  else
    v_street := null; v_landmark := null; v_rider_notes := null;
  end if;

  -- Payment rules
  if v_pay = 'gcash' then
    if v_ref is null or length(v_ref) < 4 then
      raise exception 'INVALID: Please enter your GCash reference number.';
    end if;
    if v_proof is null or v_proof !~ '^proofs/[A-Za-z0-9._\-/]+$' then
      raise exception 'INVALID: Please upload a screenshot of your GCash payment.';
    end if;
  else
    v_ref := null; v_proof := null;
  end if;

  insert into public.orders (
    customer_id, customer_name, customer_phone, order_type, scheduled_for,
    zone_id, zone_name, street, landmark, rider_notes,
    subtotal, delivery_fee, total, payment_method, payment_status, gcash_reference, payment_proof_path
  ) values (
    auth.uid(), v_name, v_phone, v_type, v_sched,
    v_zone.id, v_zone.name, v_street, v_landmark, v_rider_notes,
    v_subtotal, v_fee, v_subtotal + v_fee, v_pay,
    case when v_pay = 'gcash' then 'for_verification'::public.payment_status else 'unpaid'::public.payment_status end,
    left(v_ref, 40), v_proof
  ) returning * into v_order;

  insert into public.order_items (order_id, menu_item_id, item_name, base_price, options, options_total, unit_price, quantity, notes, line_total)
  select v_order.id, (l ->> 'menu_item_id')::uuid, l ->> 'item_name', (l ->> 'base_price')::numeric, l -> 'options',
         (l ->> 'options_total')::numeric, (l ->> 'unit_price')::numeric, (l ->> 'quantity')::int, l ->> 'notes', (l ->> 'line_total')::numeric
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object('order_number', v_order.order_number, 'token', v_order.public_token, 'total', v_order.total);
end $$;

-- =====================================================================
-- RPC: public order lookup by secret token (for the shareable status link)
-- =====================================================================
create or replace function public.get_order_by_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'order_type', o.order_type,
    'customer_name', o.customer_name, 'scheduled_for', o.scheduled_for,
    'zone_name', o.zone_name, 'street', o.street, 'landmark', o.landmark,
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'total', o.total,
    'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'cancel_reason', o.cancel_reason, 'created_at', o.created_at, 'updated_at', o.updated_at,
    'accepted_at', o.accepted_at, 'ready_at', o.ready_at, 'picked_up_at', o.picked_up_at,
    'completed_at', o.completed_at, 'cancelled_at', o.cancelled_at,
    'rider_name', (select split_part(r.name, ' ', 1) from public.riders r where r.id = o.rider_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                'item_name', i.item_name, 'quantity', i.quantity, 'options', i.options,
                'notes', i.notes, 'unit_price', i.unit_price, 'line_total', i.line_total) order by i.id)
              from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o where o.public_token = p_token;
$$;

-- =====================================================================
-- RPC: rider actions (only on their own assigned orders)
-- =====================================================================
create or replace function public.rider_update_order(p_order_id uuid, p_action text) returns public.order_status
language plpgsql volatile security definer set search_path = public as $$
declare
  v_rider uuid := public.current_rider_id();
  v_order public.orders;
begin
  if v_rider is null then raise exception 'Not a rider'; end if;
  select * into v_order from public.orders where id = p_order_id and rider_id = v_rider for update;
  if not found then raise exception 'Order not assigned to you'; end if;

  if p_action = 'picked_up' then
    if v_order.status not in ('preparing', 'ready') then
      raise exception 'Order is % — cannot mark picked up', v_order.status;
    end if;
    update public.orders set status = 'out_for_delivery' where id = p_order_id;
    return 'out_for_delivery';
  elsif p_action = 'delivered' then
    if v_order.status <> 'out_for_delivery' then
      raise exception 'Mark the order as picked up first';
    end if;
    update public.orders set status = 'completed' where id = p_order_id;
    return 'completed';
  end if;
  raise exception 'Unknown action %', p_action;
end $$;

-- =====================================================================
-- RPC: daily summary for admins (dates in store timezone)
-- =====================================================================
create or replace function public.daily_summary(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz     text := (select timezone from public.store_settings where id = 1);
  d      date;
  result jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  d := coalesce(p_date, (now() at time zone tz)::date);

  with day_orders as (
    select * from public.orders
    where (created_at at time zone tz)::date = d
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

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.store_settings          enable row level security;
alter table public.delivery_zones          enable row level security;
alter table public.users                   enable row level security;
alter table public.riders                  enable row level security;
alter table public.menu_categories         enable row level security;
alter table public.menu_items              enable row level security;
alter table public.option_groups           enable row level security;
alter table public.item_options            enable row level security;
alter table public.menu_item_option_groups enable row level security;
alter table public.orders                  enable row level security;
alter table public.order_items             enable row level security;

-- Public catalogue: anyone can read; only admins write.
do $$
declare t text;
begin
  foreach t in array array['store_settings', 'delivery_zones', 'menu_categories', 'menu_items',
                           'option_groups', 'item_options', 'menu_item_option_groups'] loop
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format('create policy "admin write" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Users
create policy "own profile read"   on public.users for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "own profile update" on public.users for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Riders
create policy "riders read"  on public.riders for select to authenticated using (public.is_admin() or user_id = auth.uid());
create policy "riders admin" on public.riders for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Orders: no direct inserts (use place_order). Admin sees/updates all;
-- customers see their own; riders see orders assigned to them.
create policy "orders read" on public.orders for select to authenticated
  using (public.is_admin() or customer_id = auth.uid() or rider_id = public.current_rider_id());
create policy "orders admin update" on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "order items read" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (public.is_admin() or o.customer_id = auth.uid() or o.rider_id = public.current_rider_id())));

-- Function grants
revoke execute on function public.place_order(jsonb, jsonb)        from public;
revoke execute on function public.rider_update_order(uuid, text)   from public, anon;
revoke execute on function public.daily_summary(date)              from public, anon;
grant  execute on function public.place_order(jsonb, jsonb)        to anon, authenticated;
grant  execute on function public.get_order_by_token(uuid)         to anon, authenticated;
grant  execute on function public.store_is_open_now()              to anon, authenticated;
grant  execute on function public.rider_update_order(uuid, text)   to authenticated;
grant  execute on function public.daily_summary(date)              to authenticated;

-- =====================================================================
-- Storage buckets
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('menu-photos',    'menu-photos',    true,  5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy "menu photos public read"  on storage.objects for select using (bucket_id = 'menu-photos');
create policy "menu photos admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'menu-photos' and public.is_admin());
create policy "menu photos admin update" on storage.objects for update to authenticated using (bucket_id = 'menu-photos' and public.is_admin());
create policy "menu photos admin delete" on storage.objects for delete to authenticated using (bucket_id = 'menu-photos' and public.is_admin());

-- Guests can upload a payment screenshot (write-only); only admins can view.
create policy "payment proof upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = 'proofs');
create policy "payment proof admin read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.is_admin());

-- =====================================================================
-- Realtime: board, rider list, menu (sold-out) and store open/closed
-- =====================================================================
alter publication supabase_realtime add table public.orders, public.menu_items, public.store_settings;
