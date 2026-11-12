-- SMS for scooter bookings (Semaphore): booking confirmed, pickup reminder,
-- cancelled, deposit refunded, and a new-booking alert to staff.
-- Texts are sent by the website's server; the database only keeps settings,
-- "already sent" stamps, a log, and a 10-minute reminder tick.

alter table public.rental_settings
  add column if not exists sms_enabled       boolean not null default true,
  add column if not exists staff_alert_phones text,                 -- comma-separated 09XXXXXXXXX numbers
  add column if not exists reminder_hours    int not null default 3 check (reminder_hours between 1 and 24);

alter table public.rental_bookings
  add column if not exists sms_confirmed_at timestamptz,
  add column if not exists sms_reminded_at  timestamptz,
  add column if not exists sms_cancelled_at timestamptz,
  add column if not exists sms_refunded_at  timestamptz;

create table if not exists public.rental_sms_log (
  id          bigint generated always as identity primary key,
  booking_id  uuid references public.rental_bookings (id) on delete cascade,
  kind        text not null check (kind in ('confirmed', 'reminder', 'cancelled', 'refunded', 'staff_alert', 'test')),
  to_number   text not null,
  message     text not null,
  status      text not null,           -- 'sent' | 'failed' | 'skipped'
  provider_id text,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists rental_sms_log_booking on public.rental_sms_log (booking_id, created_at);
alter table public.rental_sms_log enable row level security;
create policy "sms log rental staff read" on public.rental_sms_log for select to authenticated using (public.has_perm('rentals'));
-- (written only by the server with the service role)

-- Reminder tick: every 10 minutes the database asks the website to send due reminders.
-- Needs private.app_config 'site_url' (e.g. https://pahuway-cafe.vercel.app); a random 'cron_key' guards the call.
insert into private.app_config (key, value) values ('cron_key', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function public.rental_cron_key_ok(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_key = (select value from private.app_config where key = 'cron_key'), false);
$$;
revoke execute on function public.rental_cron_key_ok(text) from public, anon, authenticated;
grant  execute on function public.rental_cron_key_ok(text) to service_role;

create or replace function public.rental_reminder_tick() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text := (select value from private.app_config where key = 'site_url');
  v_key text := (select value from private.app_config where key = 'cron_key');
begin
  if v_url is null or v_key is null then return; end if;
  if not exists (select 1 from public.rental_bookings b, public.rental_settings rs
                 where rs.id = 1 and rs.sms_enabled and b.status = 'confirmed' and b.sms_reminded_at is null
                   and b.pickup_at between now() and now() + make_interval(hours => rs.reminder_hours)) then
    return;  -- nothing due: don't wake the website
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/rentals/reminders',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', v_key),
    timeout_milliseconds := 10000);
exception when others then
  null;
end $$;
revoke execute on function public.rental_reminder_tick() from public, anon, authenticated;

do $do$
begin
  perform cron.schedule('rental-sms-reminders', '*/10 * * * *', 'select public.rental_reminder_tick()');
exception when others then
  raise notice 'pg_cron unavailable (%); pickup reminders need the cron job', sqlerrm;
end
$do$;
