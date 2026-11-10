-- =====================================================================
-- Header branding: colours and titles for the customer and staff headers.
-- null colour = the built-in default (cream customer header, dark brown staff header).
-- =====================================================================
alter table public.store_settings
  add column if not exists header_color       text check (header_color is null or header_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists staff_header_color text check (staff_header_color is null or staff_header_color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists staff_title        text not null default 'Pahuway Staff'
    check (char_length(trim(staff_title)) between 1 and 40);

alter table public.store_settings
  add constraint store_name_length check (char_length(trim(store_name)) between 1 and 40);
