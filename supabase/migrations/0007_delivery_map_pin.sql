-- =====================================================================
-- Delivery map pins (OpenStreetMap on the site; riders navigate with
-- Google Maps or Waze). Pins are optional: customers may skip them.
-- =====================================================================
alter table public.orders
  add column if not exists delivery_lat numeric(9,6) check (delivery_lat between -90 and 90),
  add column if not exists delivery_lng numeric(9,6) check (delivery_lng between -180 and 180),
  add constraint delivery_pin_pair check ((delivery_lat is null) = (delivery_lng is null));

-- A signed-in customer's saved pin (prefilled at checkout)
alter table public.users
  add column if not exists saved_lat numeric(9,6) check (saved_lat between -90 and 90),
  add column if not exists saved_lng numeric(9,6) check (saved_lng between -180 and 180);

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
  v_lat          numeric(9,6);
  v_lng          numeric(9,6);
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
    -- Optional map pin: both or neither, and somewhere in the Philippines.
    if nullif(p_order ->> 'lat', '') is not null or nullif(p_order ->> 'lng', '') is not null then
      begin
        v_lat := (p_order ->> 'lat')::numeric;
        v_lng := (p_order ->> 'lng')::numeric;
      exception when others then
        raise exception 'INVALID: The map pin looks wrong. Please move the pin again or remove it.';
      end;
      if v_lat is null or v_lng is null or v_lat not between 4 and 22 or v_lng not between 116 and 128 then
        raise exception 'INVALID: The map pin must be in the Philippines. Please move the pin or remove it.';
      end if;
    end if;
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
    payment_expires_at, delivery_lat, delivery_lng
  ) values (
    auth.uid(), v_name, v_phone, v_type, v_sched,
    v_zone.id, v_zone.name, v_street, v_landmark, v_rider_notes,
    v_subtotal, v_fee, v_subtotal + v_fee, v_pay,
    case v_pay when 'gcash' then 'for_verification'::public.payment_status
               when 'online' then 'awaiting_payment'::public.payment_status
               else 'unpaid'::public.payment_status end,
    left(v_ref, 40), v_proof,
    case when v_pay = 'online' then now() + interval '30 minutes' end,
    v_lat, v_lng
  ) returning * into v_order;

  insert into public.order_items (order_id, menu_item_id, item_name, base_price, options, options_total, unit_price, quantity, notes, line_total)
  select v_order.id, (l ->> 'menu_item_id')::uuid, l ->> 'item_name', (l ->> 'base_price')::numeric, l -> 'options',
         (l ->> 'options_total')::numeric, (l ->> 'unit_price')::numeric, (l ->> 'quantity')::int, l ->> 'notes', (l ->> 'line_total')::numeric
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object('order_number', v_order.order_number, 'token', v_order.public_token, 'total', v_order.total,
                            'payment_method', v_order.payment_method);
end $$;
