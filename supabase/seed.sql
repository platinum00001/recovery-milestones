-- =====================================================================
-- Recovery Milestones — seed.sql
-- EXAMPLE DATA ONLY. Every row below is fictional and labeled "(Example)".
-- Do not present these as real coaches or businesses. Remove before launch
-- with the cleanup block at the bottom.
-- =====================================================================

-- Example coaches (no real people)
insert into milestones.coaches (display_name, bio, specialties, service_area, languages, availability, is_example) values
  ('Example Coach A (Example)', 'Placeholder profile. A certified recovery coach would describe their lived experience and approach here.', array['Early recovery','Peer support'], 'Upper & Mid Cape', array['English'], 'Weekday evenings', true),
  ('Example Coach B (Example)', 'Placeholder profile for a family-focused recovery coach.', array['Family recovery','Parenting in recovery'], 'Falmouth & Woods Hole', array['English','Portuguese'], 'Weekends', true),
  ('Example Coach C (Example)', 'Placeholder profile for a coach who supports people returning to work.', array['Employment','Housing navigation'], 'Nashua, NH', array['English','Spanish'], 'Flexible', true);

-- Example business owners (fictional sign-ins that cannot log in: no password, example.org addresses)
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'example-coffee@example.org', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"example":true}'),
  ('00000000-0000-4000-8000-00000000b002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'example-bakery@example.org', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"example":true}'),
  ('00000000-0000-4000-8000-00000000b003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'example-yoga@example.org', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"example":true}')
on conflict (id) do nothing;

insert into milestones.profiles (id, role) values
  ('00000000-0000-4000-8000-00000000b001', 'business'),
  ('00000000-0000-4000-8000-00000000b002', 'business'),
  ('00000000-0000-4000-8000-00000000b003', 'business')
on conflict (id) do nothing;

insert into milestones.businesses (id, owner_id, name, description, town, state, address, lat, lng, status, featured, sponsor_tier) values
  ('00000000-0000-4000-8000-0000000b0001', '00000000-0000-4000-8000-00000000b001', 'Main Street Coffee (Example)', 'Example listing — a cozy coffee shop.', 'Falmouth', 'MA', 'Main St, Falmouth, MA', 41.5515, -70.6148, 'approved', true, 'sprout'),
  ('00000000-0000-4000-8000-0000000b0002', '00000000-0000-4000-8000-00000000b002', 'Harbor Bakery (Example)', 'Example listing — fresh bread and pastries.', 'Hyannis', 'MA', 'Main St, Hyannis, MA', 41.6525, -70.2881, 'approved', false, null),
  ('00000000-0000-4000-8000-0000000b0003', '00000000-0000-4000-8000-00000000b003', 'Tidepool Yoga (Example)', 'Example listing — community yoga classes.', 'Woods Hole', 'MA', 'Water St, Woods Hole, MA', 41.5265, -70.6693, 'approved', false, null)
on conflict (id) do nothing;

insert into milestones.offers (business_id, title, description, reward_type, reward_value, milestones, expires_on, redemption_rules, per_user_limit) values
  ('00000000-0000-4000-8000-0000000b0001', 'Free coffee of any size (Example)', 'Celebrate with a drink on us.', 'free_item', null, array['d30','d60','d90','m6','m9','y1','yN'], current_date + 180, 'Show your code at the counter. One per visit.', 1),
  ('00000000-0000-4000-8000-0000000b0002', '20% off a celebration cake (Example)', 'Any whole cake, order 2 days ahead.', 'percent_off', 20, array['y1','yN'], current_date + 365, 'Mention the code when ordering.', 1),
  ('00000000-0000-4000-8000-0000000b0003', 'Free first class (Example)', 'Any drop-in class.', 'free_item', null, array['h24','d30','d90'], current_date + 120, 'Book online, show code at check-in.', 1);

-- ---------------------------------------------------------------------
-- CLEANUP (run before launch):
-- delete from milestones.coaches where is_example;
-- delete from auth.users where email like 'example-%@example.org';   -- cascades to example businesses & offers
-- ---------------------------------------------------------------------
