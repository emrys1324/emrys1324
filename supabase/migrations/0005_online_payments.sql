-- =====================================================================
-- Online payments via PayMongo (GCash + QR Ph), alongside cash and manual GCash.
--
-- Flow: place_order(payment_method='online') → order is created with
-- payment_status 'awaiting_payment' (hidden from staff) → the site creates a
-- PayMongo Checkout Session → PayMongo webhook → mark_order_paid() → the order
-- appears on the staff board. Unpaid online orders auto-cancel after 30 min.
-- =====================================================================

alter type public.payment_method add value if not exists 'online';
alter type public.payment_status add value if not exists 'awaiting_payment';
alter type public.payment_status add value if not exists 'refunded';

alter table public.orders
  add column if not exists paymongo_checkout_id text unique,
  add column if not exists paymongo_payment_id  text,
  add column if not exists paymongo_refund_id   text,
  add column if not exists checkout_url         text,
  add column if not exists payment_expires_at   timestamptz,
  add column if not exists paid_at              timestamptz,
  add column if not exists refunded_at          timestamptz;

-- Admin switch; stays off until PayMongo keys are configured on the server.
alter table public.store_settings
  add column if not exists online_payments_enabled boolean not null default false;

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
  if v_pay = 'online' then
    if not coalesce(s.online_payments_enabled, false) then
      raise exception 'INVALID: Online payment isn''t available right now. Please choose another payment method.';
    end if;
    v_ref := null; v_proof := null;
  elsif v_pay = 'gcash' then
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
    subtotal, delivery_fee, total, payment_method, payment_status, gcash_reference, payment_proof_path,
    payment_expires_at
  ) values (
    auth.uid(), v_name, v_phone, v_type, v_sched,
    v_zone.id, v_zone.name, v_street, v_landmark, v_rider_notes,
    v_subtotal, v_fee, v_subtotal + v_fee, v_pay,
    case v_pay when 'gcash' then 'for_verification'::public.payment_status
               when 'online' then 'awaiting_payment'::public.payment_status
               else 'unpaid'::public.payment_status end,
    left(v_ref, 40), v_proof,
    case when v_pay = 'online' then now() + interval '30 minutes' end
  ) returning * into v_order;

  insert into public.order_items (order_id, menu_item_id, item_name, base_price, options, options_total, unit_price, quantity, notes, line_total)
  select v_order.id, (l ->> 'menu_item_id')::uuid, l ->> 'item_name', (l ->> 'base_price')::numeric, l -> 'options',
         (l ->> 'options_total')::numeric, (l ->> 'unit_price')::numeric, (l ->> 'quantity')::int, l ->> 'notes', (l ->> 'line_total')::numeric
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object('order_number', v_order.order_number, 'token', v_order.public_token, 'total', v_order.total,
                            'payment_method', v_order.payment_method);
end $$;

create or replace function public.get_order_by_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'order_number', o.order_number, 'status', o.status, 'order_type', o.order_type,
    'customer_name', o.customer_name, 'scheduled_for', o.scheduled_for,
    'zone_name', o.zone_name, 'street', o.street, 'landmark', o.landmark,
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'total', o.total,
    'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'cancel_reason', o.cancel_reason,
    'checkout_url', case when o.payment_status::text = 'awaiting_payment' then o.checkout_url end,
    'payment_expires_at', o.payment_expires_at, 'paid_at', o.paid_at, 'created_at', o.created_at, 'updated_at', o.updated_at,
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

-- ---------------------------------------------------------------------
-- Called only by the server's PayMongo webhook (service role).
-- Idempotent; refuses amount mismatches; flags payments that arrive after
-- the order was cancelled so staff can refund them.
-- ---------------------------------------------------------------------
create or replace function public.mark_order_paid(p_checkout_id text, p_payment_id text, p_amount_centavos bigint)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where paymongo_checkout_id = p_checkout_id for update;
  if not found then return 'not_found'; end if;
  if o.payment_status in ('paid', 'refunded') then return 'already_paid'; end if;
  if p_amount_centavos <> round(o.total * 100)::bigint then return 'amount_mismatch'; end if;
  update public.orders
     set payment_status = 'paid', paymongo_payment_id = p_payment_id, paid_at = now()
   where id = o.id;
  return case when o.status = 'cancelled' then 'paid_after_cancel' else 'paid' end;
end $$;

revoke execute on function public.mark_order_paid(text, text, bigint) from public, anon, authenticated;
grant  execute on function public.mark_order_paid(text, text, bigint) to service_role;

-- Cancel online orders whose payment window passed (runs every 5 minutes).
create or replace function public.expire_unpaid_orders() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update public.orders
     set status = 'cancelled', cancel_reason = 'Online payment was not completed within 30 minutes.'
   where payment_method = 'online' and payment_status = 'awaiting_payment'
     and status <> 'cancelled' and payment_expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.expire_unpaid_orders() from public, anon, authenticated;

do $do$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('expire-unpaid-orders', '*/5 * * * *', 'select public.expire_unpaid_orders()');
exception when others then
  raise notice 'pg_cron unavailable (%); unpaid online orders will not auto-expire', sqlerrm;
end
$do$;

-- ---------------------------------------------------------------------
-- Staff alerts: an online order counts as "new" when it is PAID, not when
-- it is created (unpaid checkouts stay invisible to the kitchen).
-- ---------------------------------------------------------------------
create or replace function public.orders_push_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url    text := (select value from private.app_config where key = 'push_webhook_url');
  v_secret text := (select value from private.app_config where key = 'push_webhook_secret');
  v_new_order bool := (tg_op = 'INSERT' and new.payment_method::text <> 'online')
                   or (tg_op = 'UPDATE' and old.payment_status::text = 'awaiting_payment'
                       and new.payment_status::text = 'paid' and new.status <> 'cancelled');
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
