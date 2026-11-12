-- Logo for the "Rent a scooter from Baybayin" card on the home page (null = scooter emoji).
alter table public.store_settings
  add column if not exists baybayin_logo_url text;
