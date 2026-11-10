-- =====================================================================
-- Pahuway Cafe — sample data (safe to run once on a fresh database)
-- Staff/rider login accounts are created by `npm run seed:users`.
-- =====================================================================

insert into public.store_settings (id, store_name, is_open, open_time, close_time, min_delivery_order, prep_minutes, gcash_name, gcash_number, gcash_qr_url)
values (1, 'Pahuway Cafe', true, '09:00', '23:30', 200, 15, 'PAHUWAY CAFE', '0917 000 0000', '/gcash-qr-sample.svg')
on conflict (id) do nothing;

-- Delivery zones (San Agustin, Romblon). Fees are placeholders — adjust in Admin → Zones.
insert into public.delivery_zones (name, fee, sort_order) values
  ('Poblacion',  30, 1),
  ('Carmen',     50, 2),
  ('Dubduban',   60, 3),
  ('Long Beach', 70, 4),
  ('Cabolutan',  80, 5);

-- Categories
insert into public.menu_categories (id, name, sort_order) values
  ('10000000-0000-0000-0000-000000000001', 'Coffee',     1),
  ('10000000-0000-0000-0000-000000000002', 'Non-Coffee', 2),
  ('10000000-0000-0000-0000-000000000003', 'Pastries',   3),
  ('10000000-0000-0000-0000-000000000004', 'Meals',      4);

-- Option groups
insert into public.option_groups (id, name, selection, is_required, max_select, sort_order) values
  ('20000000-0000-0000-0000-000000000001', 'Temperature', 'single', true,  null, 1),
  ('20000000-0000-0000-0000-000000000002', 'Sugar level', 'single', true,  null, 2),
  ('20000000-0000-0000-0000-000000000003', 'Milk',        'single', false, null, 3),
  ('20000000-0000-0000-0000-000000000004', 'Add-ons',     'multi',  false, 3,    4),
  ('20000000-0000-0000-0000-000000000005', 'Size',        'single', true,  null, 1),
  ('20000000-0000-0000-0000-000000000006', 'Meal add-ons','multi',  false, null, 5);

insert into public.item_options (group_id, name, price_delta, is_default, sort_order) values
  ('20000000-0000-0000-0000-000000000001', 'Hot',            0, true,  1),
  ('20000000-0000-0000-0000-000000000001', 'Iced',          10, false, 2),
  ('20000000-0000-0000-0000-000000000002', '0% (no sugar)',  0, false, 1),
  ('20000000-0000-0000-0000-000000000002', '25%',            0, false, 2),
  ('20000000-0000-0000-0000-000000000002', '50%',            0, false, 3),
  ('20000000-0000-0000-0000-000000000002', '75%',            0, false, 4),
  ('20000000-0000-0000-0000-000000000002', '100% (regular)', 0, true,  5),
  ('20000000-0000-0000-0000-000000000003', 'Fresh milk',     0, true,  1),
  ('20000000-0000-0000-0000-000000000003', 'Oat milk',      40, false, 2),
  ('20000000-0000-0000-0000-000000000004', 'Extra shot',    40, false, 1),
  ('20000000-0000-0000-0000-000000000004', 'Vanilla syrup', 25, false, 2),
  ('20000000-0000-0000-0000-000000000004', 'Whipped cream', 20, false, 3),
  ('20000000-0000-0000-0000-000000000005', 'Solo (8")',      0, true,  1),
  ('20000000-0000-0000-0000-000000000005', 'Sharing (12")', 220, false, 2),
  ('20000000-0000-0000-0000-000000000006', 'Extra rice',    25, false, 1),
  ('20000000-0000-0000-0000-000000000006', 'Fried egg',     20, false, 2);

-- Menu items (20)
insert into public.menu_items (id, category_id, name, description, price, photo_url, is_sold_out, sort_order) values
  -- Coffee
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Americano',          'Double espresso over hot water. Bold, clean, Romblon mornings.', 120, '/menu/hot-coffee.svg', false, 1),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Café Latte',         'Espresso with silky steamed milk.',                               150, '/menu/latte.svg',      false, 2),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Spanish Latte',      'Sweetened condensed milk and espresso — a local favorite.',       165, '/menu/iced-coffee.svg',false, 3),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Cappuccino',         'Equal parts espresso, milk and thick foam.',                      150, '/menu/latte.svg',      false, 4),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Caramel Macchiato',  'Vanilla, milk, espresso and a caramel drizzle.',                  175, '/menu/iced-coffee.svg',false, 5),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Sea Salt Latte',     'Our signature: latte topped with lightly salted cream.',          180, '/menu/iced-coffee.svg',false, 6),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Mocha',              'Espresso, dark chocolate and milk.',                              170, '/menu/hot-coffee.svg', false, 7),
  -- Non-coffee
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', 'Matcha Latte',       'Ceremonial-grade matcha whisked with milk.',                      170, '/menu/matcha.svg',     false, 1),
  ('30000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', 'Ube Latte',          'Creamy purple yam with milk. No coffee.',                         165, '/menu/ube.svg',        false, 2),
  ('30000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002', 'Tablea Chocolate',   'Rich Filipino cacao tablea, hot or iced.',                        140, '/menu/hot-coffee.svg', false, 3),
  ('30000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000002', 'Calamansi Honey Cooler', 'Fresh calamansi, wild honey and soda. Very refreshing.',       110, '/menu/cooler.svg',     false, 4),
  ('30000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', 'Mango Shake',        'Ripe Philippine mangoes blended with ice.',                       150, '/menu/cooler.svg',     false, 5),
  -- Pastries
  ('30000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000003', 'Ensaymada',          'Soft brioche with butter, sugar and grated cheese.',               75, '/menu/pastry.svg',     false, 1),
  ('30000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000003', 'Banana Bread',       'Moist loaf slice made with local saba bananas.',                    85, '/menu/pastry.svg',     false, 2),
  ('30000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000003', 'Butter Croissant',   'Flaky, buttery, baked every morning.',                              95, '/menu/croissant.svg',  true,  3),
  ('30000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000003', 'Ube Cheese Pandesal','3 pieces of soft ube bread with a melty cheese center.',            90, '/menu/pastry.svg',     false, 4),
  -- Meals
  ('30000000-0000-0000-0000-000000000017', '10000000-0000-0000-0000-000000000004', 'Chicken Adobo Rice Bowl', 'Slow-braised adobo, garlic rice, pickled papaya.',           220, '/menu/bowl.svg',       false, 1),
  ('30000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000004', 'Tapsilog',           'Beef tapa, garlic rice and a sunny-side-up egg.',                  230, '/menu/bowl.svg',       false, 2),
  ('30000000-0000-0000-0000-000000000019', '10000000-0000-0000-0000-000000000004', 'Tuna Pesto Pasta',   'Local tuna, basil pesto and toasted garlic.',                      210, '/menu/bowl.svg',       false, 3),
  ('30000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000004', 'Margherita Pizza',   'Tomato, mozzarella and basil on a thin crust.',                    280, '/menu/pizza.svg',      false, 4);

-- Attach option groups to items
insert into public.menu_item_option_groups (item_id, group_id, sort_order)
select i.id, g.id, g.sort_order
from public.menu_items i
cross join public.option_groups g
where
  -- espresso drinks + hot/iced non-coffee: temperature, sugar
  (i.name in ('Americano','Café Latte','Spanish Latte','Cappuccino','Caramel Macchiato','Sea Salt Latte','Mocha',
              'Matcha Latte','Ube Latte','Tablea Chocolate')
     and g.name in ('Temperature','Sugar level'))
  -- milk-based drinks: milk choice
  or (i.name in ('Café Latte','Spanish Latte','Cappuccino','Caramel Macchiato','Sea Salt Latte','Mocha','Matcha Latte','Ube Latte','Tablea Chocolate')
     and g.name = 'Milk')
  -- coffee add-ons
  or (i.name in ('Americano','Café Latte','Spanish Latte','Cappuccino','Caramel Macchiato','Sea Salt Latte','Mocha') and g.name = 'Add-ons')
  -- cold-only drinks: sugar only
  or (i.name in ('Calamansi Honey Cooler','Mango Shake') and g.name = 'Sugar level')
  -- meals
  or (i.name in ('Chicken Adobo Rice Bowl','Tapsilog') and g.name = 'Meal add-ons')
  or (i.name = 'Margherita Pizza' and g.name = 'Size');
