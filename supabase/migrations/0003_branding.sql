-- =====================================================================
-- Branding: admin-editable logo and customer background image.
-- Images live in the public "menu-photos" bucket (admin-only uploads).
-- =====================================================================
alter table public.store_settings
  add column if not exists logo_url        text,                      -- null = bundled default logo
  add column if not exists background_url  text,                      -- null = plain cream background
  add column if not exists background_fade int not null default 85    -- % of cream overlay on top of the photo
    check (background_fade between 40 and 95);
