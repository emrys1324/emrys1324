-- Minimal stand-ins for Supabase-managed schemas (auth, storage, realtime) so the
-- migration and scenarios can run on a plain local Postgres. NOT for production.
do $$ begin if not exists (select from pg_roles where rolname=$r$anon$r$) then create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; end if; end $$;
create schema auth; create schema storage; create schema realtime;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create table realtime.log (topic text, payload jsonb);
create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void language sql as $$ insert into realtime.log values (topic, payload) $$;
create publication supabase_realtime;
grant usage on schema public, auth, storage to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
