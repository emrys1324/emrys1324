-- =====================================================================
-- Isla mobile app support:
--   1. Café contact details (shown in the privacy policy)
--   2. In-app account deletion (required by Apple & Google Play)
--   3. Push notification device tokens + order subscriptions
--   4. Order events → push sender webhook (via pg_net)
-- =====================================================================

-- ---------- 1. Contact details --------------------------------------
alter table public.store_settings
  add column if not exists contact_phone text,
  add column if not exists contact_email text;

-- ---------- 2. Account deletion -------------------------------------
-- Deletes the caller's login and profile. Past orders are kept for the
-- café's records but unlinked from the account (customer_id → null).
create or replace function public.delete_my_account() returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if exists (select 1 from public.users where id = v_uid and role = 'admin')
     and (select count(*) from public.users where role = 'admin') <= 1 then
    raise exception 'You are the only admin. Make another staff member an admin before deleting this account.';
  end if;
  update public.riders set is_active = false where user_id = v_uid;
  delete from auth.users where id = v_uid;  -- cascades to public.users, push_tokens
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;

-- ---------- 3. Push tokens ------------------------------------------
create table public.push_tokens (
  token        text primary key,                 -- FCM registration token
  platform     text not null check (platform in ('android', 'ios')),
  user_id      uuid references public.users (id) on delete cascade,  -- null = guest device
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);

-- A guest device that asked for updates about a specific order
create table public.order_push_subscriptions (
  order_id    uuid not null references public.orders (id) on delete cascade,
  token       text not null references public.push_tokens (token) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (order_id, token)
);

alter table public.push_tokens enable row level security;
alter table public.order_push_subscriptions enable row level security;
-- No policies: only the RPCs below and the server (service role) touch these tables.
revoke all on public.push_tokens, public.order_push_subscriptions from anon, authenticated;

-- Called by the app after the phone grants notification permission.
-- Re-linking on every call means a shared tablet follows whoever is signed in.
create or replace function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then
    raise exception 'Invalid push token';
  end if;
  if p_platform not in ('android', 'ios') then raise exception 'Invalid platform'; end if;
  insert into public.push_tokens (token, platform, user_id)
  values (p_token, p_platform, auth.uid())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;

-- Called from the order status page: "notify me about this order".
create or replace function public.subscribe_order_push(p_token text, p_platform text, p_order_token uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_order uuid;
begin
  select id into v_order from public.orders
  where public_token = p_order_token and created_at > now() - interval '2 days';
  if v_order is null then raise exception 'Order not found'; end if;
  insert into public.push_tokens (token, platform, user_id)
  values (p_token, p_platform, auth.uid())
  on conflict (token) do update set last_seen_at = now();
  insert into public.order_push_subscriptions (order_id, token) values (v_order, p_token)
  on conflict do nothing;
end $$;

-- Sign-out on a shared device: stop staff alerts going to the next person.
create or replace function public.unregister_push_token(p_token text) returns void
language sql volatile security definer set search_path = public as $$
  update public.push_tokens set user_id = null where token = p_token;
$$;

revoke execute on function public.register_push_token(text, text) from public;
revoke execute on function public.subscribe_order_push(text, text, uuid) from public;
revoke execute on function public.unregister_push_token(text) from public;
grant execute on function public.register_push_token(text, text) to anon, authenticated;
grant execute on function public.subscribe_order_push(text, text, uuid) to anon, authenticated;
grant execute on function public.unregister_push_token(text) to anon, authenticated;

-- ---------- 4. Order events → push webhook --------------------------
-- Private config (not exposed through the API). Set after deploy:
--   insert into private.app_config values
--     ('push_webhook_url', 'https://<your-site>/api/push/order-event'),
--     ('push_webhook_secret', '<same value as PUSH_WEBHOOK_SECRET on Vercel>')
--   on conflict (key) do update set value = excluded.value;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_config (key text primary key, value text not null);

create extension if not exists pg_net with schema extensions;

create or replace function public.orders_push_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_url    text := (select value from private.app_config where key = 'push_webhook_url');
  v_secret text := (select value from private.app_config where key = 'push_webhook_secret');
  v_new_order bool := tg_op = 'INSERT';
  v_rider     bool := tg_op = 'UPDATE' and new.rider_id is not null and new.rider_id is distinct from old.rider_id;
  v_status    bool := tg_op = 'UPDATE' and new.status is distinct from old.status;
begin
  if v_url is null or v_secret is null then return null; end if;  -- push not configured yet
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
    null;  -- never block an order because push is unavailable
  end;
  return null;
end $$;

create trigger orders_push_webhook
  after insert or update on public.orders
  for each row execute function public.orders_push_webhook();
