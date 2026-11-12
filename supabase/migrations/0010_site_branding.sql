-- Separate branding for the welcome (home) page, Pahuway Cafe and Baybayin scooter rental,
-- editable welcome texts, and an uploadable website icon (browser tab / home screen).
alter table public.store_settings
  add column if not exists site_name             text,   -- welcome page header title (null = café name)
  add column if not exists site_tagline          text,   -- null = café tagline, '' = none
  add column if not exists site_logo_url         text,   -- null = café logo
  add column if not exists site_header_color     text,   -- null = café header colour
  add column if not exists welcome_title         text,   -- null = "Welcome!"
  add column if not exists welcome_subtitle      text,   -- null = "What would you like to do today?"
  add column if not exists cafe_card_text        text,
  add column if not exists baybayin_card_text    text,
  add column if not exists store_tagline         text,   -- café header tagline (null = "San Agustin, Romblon")
  add column if not exists baybayin_name         text,   -- null = "Baybayin"
  add column if not exists baybayin_tagline      text,
  add column if not exists baybayin_header_color text,
  add column if not exists site_icons            jsonb;  -- {"32": url, "180": url, "192": url, "512": url}

alter table public.store_settings drop constraint if exists brand_colours_hex;
alter table public.store_settings add constraint brand_colours_hex check (
  (site_header_color is null or site_header_color ~ '^#[0-9a-fA-F]{6}$') and
  (baybayin_header_color is null or baybayin_header_color ~ '^#[0-9a-fA-F]{6}$'));
