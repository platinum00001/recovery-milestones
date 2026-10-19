-- =====================================================================
-- Recovery Milestones — 001_init.sql
-- Schema, tables, Row Level Security, and RPC functions.
--
-- Everything lives in its own schema `milestones` so it can share a Supabase
-- project with other sites without table-name collisions. Add `milestones`
-- to Project Settings > Data API > Exposed schemas (see docs/SETUP.md).
--
-- Privacy rules baked in here:
--   * Sobriety dates are private by default; only shown via opt-in flags.
--   * Members only ever see their own rows.
--   * Businesses see their own business/offers and redemption codes against
--     them, never member identities.
--   * Admins get aggregates; public impact numbers are small-number suppressed.
-- =====================================================================

create schema if not exists milestones;
grant usage on schema milestones to anon, authenticated, service_role;

-- New functions are not executable by PUBLIC unless granted below.
alter default privileges in schema milestones revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- Pure helper functions (milestone math mirrors js/milestones.js)
-- ---------------------------------------------------------------------
create or replace function milestones.short_code(len int default 8)
returns text language plpgsql volatile set search_path = pg_catalog as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  out text := '';
begin
  if len < 1 or len > 32 then raise exception 'bad length'; end if;
  for i in 0..len - 1 loop
    out := out || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function milestones.milestone_date(clean date, key text)
returns date language sql immutable set search_path = pg_catalog as $$
  select case key
    when 'h24' then clean + 1
    when 'd30' then clean + 30
    when 'd60' then clean + 60
    when 'd90' then clean + 90
    when 'm6'  then (clean + interval '6 months')::date
    when 'm9'  then (clean + interval '9 months')::date
    else case when key ~ '^y[1-9][0-9]*$'
              then (clean + make_interval(years => substr(key, 2)::int))::date end
  end
$$;

create or replace function milestones.is_milestone_key(key text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select key in ('h24','d30','d60','d90','m6','m9') or key ~ '^y[1-9][0-9]*$'
$$;

-- All milestones reached on or before `day`.
create or replace function milestones.milestones_reached(clean date, day date)
returns table (key text, reached_on date)
language sql immutable set search_path = pg_catalog, milestones as $$
  with keys as (
    select k from unnest(array['h24','d30','d60','d90','m6','m9']) k
    union all
    select 'y' || n from generate_series(1, greatest(0, extract(year from age(day, clean))::int)) n
  )
  select k, milestones.milestone_date(clean, k) from keys
  where clean is not null and milestones.milestone_date(clean, k) <= day
  order by 2
$$;

create or replace function milestones.milestones_on(clean date, day date)
returns text[] language sql immutable set search_path = pg_catalog, milestones as $$
  select coalesce(array_agg(key), '{}') from milestones.milestones_reached(clean, day) where reached_on = day
$$;

-- Offer targets: exact key, or 'yN' = every anniversary from year 2 on.
create or replace function milestones.target_matches(target text, key text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select target = key or (target = 'yN' and key ~ '^y[0-9]+$' and substr(key, 2)::int >= 2)
$$;

create or replace function milestones.eligible_milestone(clean date, day date, targets text[], window_days int default 30)
returns text language sql immutable set search_path = pg_catalog, milestones as $$
  select r.key from milestones.milestones_reached(clean, day) r
  where r.reached_on >= day - window_days
    and exists (select 1 from unnest(targets) t where milestones.target_matches(t, r.key))
  order by r.reached_on desc limit 1
$$;

create or replace function milestones.suppress(n bigint)
returns text language sql immutable set search_path = pg_catalog as $$
  select case when coalesce(n, 0) < 10 then '<10' else n::text end
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table milestones.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  clean_date date check (clean_date >= date '1900-01-01'),
  timezone text not null default 'America/New_York' check (char_length(timezone) <= 64),
  role text not null default 'member' check (role in ('member','business','admin')),
  show_name_public boolean not null default false,   -- show display name on cards/wall
  wall_public boolean not null default false,        -- badge wall reachable by link
  wall_show_date boolean not null default false,     -- show clean date on public wall/cards
  wall_slug text not null unique default lower(milestones.short_code(12)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table milestones.notification_prefs (
  user_id uuid primary key references milestones.profiles(id) on delete cascade,
  email_milestones boolean not null default false,   -- opt-in
  email_reminders boolean not null default false,    -- opt-in
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

create table milestones.sponsor_tiers (
  key text primary key,
  name text not null,
  price_cents int not null check (price_cents >= 0),
  billing_interval text not null default 'month' check (billing_interval in ('month','year','one_time')),
  perks text[] not null default '{}',
  sort int not null default 0,
  active boolean not null default true
);

create table milestones.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references milestones.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  description text check (char_length(description) <= 600),
  contact_email text check (char_length(contact_email) <= 200),
  phone text check (char_length(phone) <= 40),
  website text check (char_length(website) <= 300),
  address text check (char_length(address) <= 200),
  town text check (char_length(town) <= 80),
  state text check (char_length(state) <= 2),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  status text not null default 'pending' check (status in ('pending','approved','suspended')),
  featured boolean not null default false,
  sponsor_tier text references milestones.sponsor_tiers(key),
  featured_until date,
  created_at timestamptz not null default now()
);

create table milestones.sponsorships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references milestones.businesses(id) on delete cascade,
  tier_key text not null references milestones.sponsor_tiers(key),
  status text not null default 'requested' check (status in ('requested','checkout_started','paid','active','cancelled')),
  stripe_session_id text,
  created_at timestamptz not null default now()
);

create table milestones.offers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references milestones.businesses(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  description text check (char_length(description) <= 500),
  reward_type text not null default 'free_item' check (reward_type in ('free_item','percent_off','amount_off','other')),
  reward_value numeric check (reward_value >= 0 and reward_value <= 10000),
  milestones text[] not null check (cardinality(milestones) >= 1
     and milestones <@ array['h24','d30','d60','d90','m6','m9','y1','yN']),
  starts_on date,
  expires_on date,
  redemption_rules text check (char_length(redemption_rules) <= 500),
  per_user_limit int not null default 1 check (per_user_limit between 1 and 10),
  total_limit int check (total_limit is null or total_limit >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (expires_on is null or starts_on is null or expires_on >= starts_on)
);
create index on milestones.offers (business_id);

create table milestones.reward_claims (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references milestones.offers(id) on delete cascade,
  user_id uuid not null references milestones.profiles(id) on delete cascade,
  milestone_key text not null,
  code text not null unique,
  status text not null default 'issued' check (status in ('issued','redeemed')),
  expires_on date,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);
create index on milestones.reward_claims (user_id);
create index on milestones.reward_claims (offer_id);

create table milestones.badges (
  user_id uuid not null references milestones.profiles(id) on delete cascade,
  milestone_key text not null,
  reached_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, milestone_key)
);

create table milestones.celebration_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references milestones.profiles(id) on delete cascade,
  milestone_key text not null,
  show_name boolean not null default false,
  show_date boolean not null default false,
  message text check (char_length(message) <= 200),
  created_at timestamptz not null default now()
);

create table milestones.supporters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references milestones.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  relationship text not null default 'friend' check (relationship in ('sponsor','friend','family','other')),
  notify_on_milestones boolean not null default false,
  consent_confirmed boolean not null check (consent_confirmed),  -- member confirms supporter agreed to be contacted
  consent_at timestamptz not null default now(),
  note_token uuid not null unique default gen_random_uuid(),
  invited_at timestamptz,
  unsubscribed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, email)
);

create table milestones.wall_notes (
  id uuid primary key default gen_random_uuid(),
  wall_user_id uuid not null references milestones.profiles(id) on delete cascade,
  supporter_id uuid references milestones.supporters(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 60),
  message text not null check (char_length(message) between 1 and 500),
  status text not null default 'pending' check (status in ('pending','approved','hidden')),
  created_at timestamptz not null default now()
);
create index on milestones.wall_notes (wall_user_id);

create table milestones.meeting_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references milestones.profiles(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  day_of_week int not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  meet_time time not null,
  active boolean not null default true,
  last_sent_on date,
  created_at timestamptz not null default now()
);

create table milestones.checkins (
  user_id uuid not null references milestones.profiles(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table milestones.coaches (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) <= 80),
  bio text check (char_length(bio) <= 800),
  specialties text[] not null default '{}',
  service_area text,
  languages text[] not null default '{English}',
  availability text,
  is_example boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table milestones.coach_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references milestones.profiles(id) on delete cascade,
  coach_id uuid references milestones.coaches(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  preferred_contact text not null default 'email' check (preferred_contact in ('email','phone','text')),
  message text check (char_length(message) <= 1000),
  consent boolean not null check (consent),
  consent_text text not null,
  status text not null default 'new' check (status in ('new','contacted','closed')),
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);

-- Service-only idempotency log for emails (never exposed to clients).
create table milestones.notification_log (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('milestone','supporter','reminder','invite')),
  ref text not null,
  sent_at timestamptz not null default now(),
  unique (kind, ref)
);

-- ---------------------------------------------------------------------
-- Role helpers (used by RLS policies)
-- ---------------------------------------------------------------------
create or replace function milestones.my_role() returns text
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select role from milestones.profiles where id = auth.uid()
$$;
create or replace function milestones.is_admin() returns boolean
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select coalesce((select role = 'admin' from milestones.profiles where id = auth.uid()), false)
$$;
create or replace function milestones.my_business_id() returns uuid
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select id from milestones.businesses where owner_id = auth.uid()
$$;
create or replace function milestones.business_is_approved(bid uuid) returns boolean
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select exists (select 1 from milestones.businesses where id = bid and status = 'approved')
$$;
create or replace function milestones.member_today(uid uuid) returns date
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select (now() at time zone coalesce((select timezone from milestones.profiles where id = uid), 'America/New_York'))::date
$$;

-- Validation trigger: no future clean dates; keep updated_at fresh.
create or replace function milestones.profiles_validate() returns trigger
language plpgsql set search_path = milestones, pg_catalog as $$
begin
  if new.clean_date is not null and new.clean_date > (now() at time zone 'UTC')::date + 1 then
    raise exception 'Clean date cannot be in the future';
  end if;
  begin perform now() at time zone new.timezone;
  exception when others then raise exception 'Unknown time zone %', new.timezone; end;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_validate before insert or update on milestones.profiles
  for each row execute function milestones.profiles_validate();

-- Simple per-user caps to limit abuse.
create or replace function milestones.enforce_caps() returns trigger
language plpgsql set search_path = milestones, pg_catalog as $$
begin
  if tg_table_name = 'supporters' and (select count(*) from milestones.supporters where user_id = new.user_id) >= 25 then
    raise exception 'You can add up to 25 supporters';
  elsif tg_table_name = 'meeting_reminders' and (select count(*) from milestones.meeting_reminders where user_id = new.user_id) >= 14 then
    raise exception 'You can add up to 14 meeting reminders';
  elsif tg_table_name = 'coach_requests' and (select count(*) from milestones.coach_requests where user_id = new.user_id and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Please wait a day before sending another coach request';
  end if;
  return new;
end $$;
create trigger supporters_cap before insert on milestones.supporters for each row execute function milestones.enforce_caps();
create trigger reminders_cap before insert on milestones.meeting_reminders for each row execute function milestones.enforce_caps();
create trigger coach_requests_cap before insert on milestones.coach_requests for each row execute function milestones.enforce_caps();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table milestones.profiles enable row level security;
alter table milestones.notification_prefs enable row level security;
alter table milestones.sponsor_tiers enable row level security;
alter table milestones.businesses enable row level security;
alter table milestones.sponsorships enable row level security;
alter table milestones.offers enable row level security;
alter table milestones.reward_claims enable row level security;
alter table milestones.badges enable row level security;
alter table milestones.celebration_cards enable row level security;
alter table milestones.supporters enable row level security;
alter table milestones.wall_notes enable row level security;
alter table milestones.meeting_reminders enable row level security;
alter table milestones.checkins enable row level security;
alter table milestones.coaches enable row level security;
alter table milestones.coach_requests enable row level security;
alter table milestones.notification_log enable row level security;  -- no policies: service role only

-- profiles: own row only; role and slug are not client-editable (column grants)
create policy profiles_select_own on milestones.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on milestones.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select on milestones.profiles to authenticated;
grant update (display_name, clean_date, timezone, show_name_public, wall_public, wall_show_date) on milestones.profiles to authenticated;

create policy prefs_select_own on milestones.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy prefs_update_own on milestones.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on milestones.notification_prefs to authenticated;
grant update (email_milestones, email_reminders) on milestones.notification_prefs to authenticated;

create policy tiers_public_read on milestones.sponsor_tiers for select to anon, authenticated using (active);
grant select on milestones.sponsor_tiers to anon, authenticated;

-- businesses: owner reads/edits own (not status/featured/tier); admin reads all. Public listing via public_businesses().
create policy businesses_select on milestones.businesses for select to authenticated using (owner_id = auth.uid() or milestones.is_admin());
create policy businesses_update_own on milestones.businesses for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
grant select on milestones.businesses to authenticated;
grant update (name, description, contact_email, phone, website, address, town, state, lat, lng) on milestones.businesses to authenticated;

create policy sponsorships_select on milestones.sponsorships for select to authenticated using (business_id = milestones.my_business_id() or milestones.is_admin());
grant select on milestones.sponsorships to authenticated;

-- offers: anyone sees live offers of approved businesses; owners manage their own.
create policy offers_public_read on milestones.offers for select to anon, authenticated using (
  (active and (expires_on is null or expires_on >= current_date)
   and milestones.business_is_approved(business_id))
  or business_id = milestones.my_business_id() or milestones.is_admin());
create policy offers_insert_own on milestones.offers for insert to authenticated with check (business_id = milestones.my_business_id());
create policy offers_update_own on milestones.offers for update to authenticated using (business_id = milestones.my_business_id()) with check (business_id = milestones.my_business_id());
create policy offers_delete_own on milestones.offers for delete to authenticated using (business_id = milestones.my_business_id());
grant select on milestones.offers to anon, authenticated;
grant insert (business_id, title, description, reward_type, reward_value, milestones, starts_on, expires_on, redemption_rules, per_user_limit, total_limit, active),
      update (title, description, reward_type, reward_value, milestones, starts_on, expires_on, redemption_rules, per_user_limit, total_limit, active),
      delete on milestones.offers to authenticated;

-- reward_claims: members see their own; created/redeemed only through RPCs.
create policy claims_select_own on milestones.reward_claims for select to authenticated using (user_id = auth.uid());
grant select on milestones.reward_claims to authenticated;

create policy badges_select_own on milestones.badges for select to authenticated using (user_id = auth.uid());
grant select on milestones.badges to authenticated;

create policy cards_select_own on milestones.celebration_cards for select to authenticated using (user_id = auth.uid());
create policy cards_delete_own on milestones.celebration_cards for delete to authenticated using (user_id = auth.uid());
grant select, delete on milestones.celebration_cards to authenticated;

create policy supporters_own on milestones.supporters for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select (id, user_id, name, email, relationship, notify_on_milestones, consent_confirmed, consent_at, invited_at, unsubscribed, created_at) on milestones.supporters to authenticated;
grant insert (name, email, relationship, notify_on_milestones, consent_confirmed), update (name, relationship, notify_on_milestones), delete on milestones.supporters to authenticated;

create policy notes_select_own on milestones.wall_notes for select to authenticated using (wall_user_id = auth.uid());
create policy notes_update_own on milestones.wall_notes for update to authenticated using (wall_user_id = auth.uid()) with check (wall_user_id = auth.uid());
create policy notes_delete_own on milestones.wall_notes for delete to authenticated using (wall_user_id = auth.uid());
grant select, delete on milestones.wall_notes to authenticated;
grant update (status) on milestones.wall_notes to authenticated;

create policy reminders_own on milestones.meeting_reminders for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, delete on milestones.meeting_reminders to authenticated;
grant insert (label, day_of_week, meet_time, active), update (label, day_of_week, meet_time, active) on milestones.meeting_reminders to authenticated;

create policy checkins_select_own on milestones.checkins for select to authenticated using (user_id = auth.uid());
grant select on milestones.checkins to authenticated;

create policy coaches_public_read on milestones.coaches for select to anon, authenticated using (active or milestones.is_admin());
create policy coaches_admin_insert on milestones.coaches for insert to authenticated with check (milestones.is_admin());
create policy coaches_admin_update on milestones.coaches for update to authenticated using (milestones.is_admin()) with check (milestones.is_admin());
create policy coaches_admin_delete on milestones.coaches for delete to authenticated using (milestones.is_admin());
grant select on milestones.coaches to anon, authenticated;
grant insert, update, delete on milestones.coaches to authenticated;

create policy coach_req_insert_own on milestones.coach_requests for insert to authenticated with check (user_id = auth.uid());
create policy coach_req_select on milestones.coach_requests for select to authenticated using (user_id = auth.uid() or milestones.is_admin());
create policy coach_req_admin_update on milestones.coach_requests for update to authenticated using (milestones.is_admin()) with check (milestones.is_admin());
grant select on milestones.coach_requests to authenticated;
grant insert (coach_id, name, email, phone, preferred_contact, message, consent, consent_text) on milestones.coach_requests to authenticated;
grant update (status) on milestones.coach_requests to authenticated;

-- Service role (edge functions) gets full access; it bypasses RLS.
grant all on all tables in schema milestones to service_role;
grant usage, select on all sequences in schema milestones to service_role;

-- ---------------------------------------------------------------------
-- Member RPCs
-- ---------------------------------------------------------------------
create or replace function milestones.ensure_profile() returns milestones.profiles
language plpgsql security definer set search_path = milestones, pg_catalog as $$
declare p milestones.profiles;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into milestones.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  insert into milestones.notification_prefs (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into p from milestones.profiles where id = auth.uid();
  return p;
end $$;

-- Bring badges in line with the current clean date (a reset date is okay — badges follow the new date).
create or replace function milestones.sync_my_badges() returns setof milestones.badges
language plpgsql security definer set search_path = milestones, pg_catalog as $$
declare c date; d date;
begin
  select clean_date into c from milestones.profiles where id = auth.uid();
  d := milestones.member_today(auth.uid());
  delete from milestones.badges b where b.user_id = auth.uid()
    and (c is null or not exists (select 1 from milestones.milestones_reached(c, d) r where r.key = b.milestone_key and r.reached_on = b.reached_on));
  if c is not null then
    insert into milestones.badges (user_id, milestone_key, reached_on)
      select auth.uid(), r.key, r.reached_on from milestones.milestones_reached(c, d) r
      on conflict (user_id, milestone_key) do nothing;
  end if;
  return query select * from milestones.badges where user_id = auth.uid() order by reached_on;
end $$;

create or replace function milestones.check_in() returns json
language plpgsql security definer set search_path = milestones, pg_catalog as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into milestones.checkins (user_id, day) values (auth.uid(), milestones.member_today(auth.uid()))
    on conflict do nothing;
  return milestones.my_streak();
end $$;

create or replace function milestones.my_streak() returns json
language sql stable security definer set search_path = milestones, pg_catalog as $$
  with t as (select milestones.member_today(auth.uid()) as today),
  d as (select day from milestones.checkins, t where user_id = auth.uid() and day <= t.today),
  g as (select day, day - (row_number() over (order by day))::int as grp from d),
  runs as (select max(day) as last_day, count(*)::int as n from g group by grp)
  select json_build_object(
    'current', coalesce((select n from runs, t where last_day >= t.today - 1 order by last_day desc limit 1), 0),
    'best', coalesce((select max(n) from runs), 0),
    'checkedToday', exists (select 1 from d, t where d.day = t.today))
$$;

-- All live offers, with whether *this* member qualifies right now.
create or replace function milestones.my_offers()
returns table (id uuid, business_id uuid, business_name text, town text, featured boolean, title text, description text,
               reward_type text, reward_value numeric, milestones text[], expires_on date, redemption_rules text,
               per_user_limit int, eligible_key text, my_claims int, sold_out boolean)
language sql stable security definer set search_path = milestones, pg_catalog as $$
  with me as (select clean_date, milestones.member_today(auth.uid()) as today from milestones.profiles where id = auth.uid())
  select o.id, o.business_id, b.name, b.town, b.featured, o.title, o.description, o.reward_type, o.reward_value, o.milestones,
         o.expires_on, o.redemption_rules, o.per_user_limit,
         (select milestones.eligible_milestone(me.clean_date, me.today, o.milestones) from me),
         (select count(*)::int from milestones.reward_claims c where c.offer_id = o.id and c.user_id = auth.uid()),
         (o.total_limit is not null and (select count(*) from milestones.reward_claims c where c.offer_id = o.id) >= o.total_limit)
  from milestones.offers o join milestones.businesses b on b.id = o.business_id
  where o.active and b.status = 'approved'
    and (o.starts_on is null or o.starts_on <= current_date)
    and (o.expires_on is null or o.expires_on >= current_date)
  order by b.featured desc, o.created_at desc
$$;

create or replace function milestones.claim_reward(p_offer uuid) returns milestones.reward_claims
language plpgsql security definer set search_path = milestones, pg_catalog as $$
declare
  p milestones.profiles; o milestones.offers; k text; today date; c milestones.reward_claims; new_code text;
begin
  select * into p from milestones.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in'; end if;
  if p.role <> 'member' then raise exception 'Rewards are for member accounts'; end if;
  if p.clean_date is null then raise exception 'Add your clean date first'; end if;
  today := milestones.member_today(p.id);
  select o2.* into o from milestones.offers o2 join milestones.businesses b on b.id = o2.business_id
    where o2.id = p_offer and o2.active and b.status = 'approved'
      and (o2.starts_on is null or o2.starts_on <= today) and (o2.expires_on is null or o2.expires_on >= today)
    for update of o2;
  if o.id is null then raise exception 'This offer is not available'; end if;
  k := milestones.eligible_milestone(p.clean_date, today, o.milestones);
  if k is null then raise exception 'This reward is for a milestone you reached in the last 30 days'; end if;
  if (select count(*) from milestones.reward_claims where offer_id = o.id and user_id = p.id) >= o.per_user_limit then
    raise exception 'You already claimed this reward';
  end if;
  if o.total_limit is not null and (select count(*) from milestones.reward_claims where offer_id = o.id) >= o.total_limit then
    raise exception 'All of these rewards have been claimed';
  end if;
  loop
    new_code := milestones.short_code(8);
    exit when not exists (select 1 from milestones.reward_claims where code = new_code);
  end loop;
  insert into milestones.reward_claims (offer_id, user_id, milestone_key, code, expires_on)
    values (o.id, p.id, k, new_code, least(coalesce(o.expires_on, today + 30), today + 30))
    returning * into c;
  return c;
end $$;

create or replace function milestones.my_claims()
returns table (id uuid, code text, status text, milestone_key text, expires_on date, created_at timestamptz, redeemed_at timestamptz,
               offer_title text, redemption_rules text, business_name text, town text)
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select c.id, c.code, c.status, c.milestone_key, c.expires_on, c.created_at, c.redeemed_at, o.title, o.redemption_rules, b.name, b.town
  from milestones.reward_claims c join milestones.offers o on o.id = c.offer_id join milestones.businesses b on b.id = o.business_id
  where c.user_id = auth.uid() order by c.created_at desc
$$;

create or replace function milestones.create_card(p_key text, p_show_name boolean, p_show_date boolean, p_message text)
returns uuid language plpgsql security definer set search_path = milestones, pg_catalog as $$
declare c date; new_id uuid;
begin
  select clean_date into c from milestones.profiles where id = auth.uid();
  if c is null then raise exception 'Add your clean date first'; end if;
  if not exists (select 1 from milestones.milestones_reached(c, milestones.member_today(auth.uid())) r where r.key = p_key) then
    raise exception 'You can make a card for milestones you have reached';
  end if;
  insert into milestones.celebration_cards (user_id, milestone_key, show_name, show_date, message)
    values (auth.uid(), p_key, coalesce(p_show_name, false), coalesce(p_show_date, false), nullif(trim(p_message), ''))
    returning id into new_id;
  return new_id;
end $$;

-- Public card: only what the member chose to show. Never the clean date unless show_date was ticked.
create or replace function milestones.get_card(p_id uuid) returns json
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select json_build_object(
    'milestone_key', k.milestone_key,
    'display_name', case when k.show_name then p.display_name end,
    'milestone_date', case when k.show_date then milestones.milestone_date(p.clean_date, k.milestone_key) end,
    'message', k.message,
    'created_at', k.created_at)
  from milestones.celebration_cards k join milestones.profiles p on p.id = k.user_id where k.id = p_id
$$;

create or replace function milestones.public_wall(p_slug text) returns json
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select case when p.wall_public then json_build_object(
    'display_name', case when p.show_name_public then p.display_name end,
    'clean_date', case when p.wall_show_date then p.clean_date end,
    'badges', coalesce((select json_agg(json_build_object('key', b.milestone_key,
                 'reached_on', case when p.wall_show_date then b.reached_on end) order by b.reached_on)
               from milestones.badges b where b.user_id = p.id), '[]'),
    'notes', coalesce((select json_agg(json_build_object('author_name', n.author_name, 'message', n.message, 'created_at', n.created_at) order by n.created_at desc)
               from milestones.wall_notes n where n.wall_user_id = p.id and n.status = 'approved'), '[]'))
  else json_build_object('private', true) end
  from milestones.profiles p where p.wall_slug = lower(p_slug)
$$;

-- Supporter note links (token from their email).
create or replace function milestones.note_context(p_token uuid) returns json
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select json_build_object('supporter_name', s.name, 'member_name', coalesce(p.display_name, 'your friend'))
  from milestones.supporters s join milestones.profiles p on p.id = s.user_id
  where s.note_token = p_token and not s.unsubscribed
$$;

create or replace function milestones.leave_note(p_token uuid, p_author text, p_message text) returns boolean
language plpgsql security definer set search_path = milestones, pg_catalog as $$
declare s milestones.supporters;
begin
  select * into s from milestones.supporters where note_token = p_token and not unsubscribed;
  if s.id is null then raise exception 'This note link is not valid'; end if;
  if (select count(*) from milestones.wall_notes where supporter_id = s.id and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Thanks! You can leave more notes tomorrow';
  end if;
  insert into milestones.wall_notes (wall_user_id, supporter_id, author_name, message)
    values (s.user_id, s.id, left(coalesce(nullif(trim(p_author), ''), s.name), 60), left(trim(p_message), 500));
  return true;
end $$;

create or replace function milestones.unsubscribe(p_token uuid) returns boolean
language plpgsql security definer set search_path = milestones, pg_catalog as $$
begin
  update milestones.notification_prefs set email_milestones = false, email_reminders = false, updated_at = now() where unsubscribe_token = p_token;
  if found then return true; end if;
  update milestones.supporters set unsubscribed = true, notify_on_milestones = false where note_token = p_token;
  return found;
end $$;

create or replace function milestones.export_my_data() returns json
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select json_build_object(
    'exported_at', now(),
    'profile', (select row_to_json(p) from milestones.profiles p where id = auth.uid()),
    'notification_prefs', (select row_to_json(n) from milestones.notification_prefs n where user_id = auth.uid()),
    'badges', (select coalesce(json_agg(b), '[]') from milestones.badges b where user_id = auth.uid()),
    'checkins', (select coalesce(json_agg(c.day), '[]') from milestones.checkins c where user_id = auth.uid()),
    'reward_claims', (select coalesce(json_agg(r), '[]') from milestones.reward_claims r where user_id = auth.uid()),
    'celebration_cards', (select coalesce(json_agg(k), '[]') from milestones.celebration_cards k where user_id = auth.uid()),
    'supporters', (select coalesce(json_agg(json_build_object('name', s.name, 'email', s.email, 'relationship', s.relationship, 'notify_on_milestones', s.notify_on_milestones, 'consent_at', s.consent_at)), '[]') from milestones.supporters s where user_id = auth.uid()),
    'wall_notes', (select coalesce(json_agg(w), '[]') from milestones.wall_notes w where wall_user_id = auth.uid()),
    'meeting_reminders', (select coalesce(json_agg(m), '[]') from milestones.meeting_reminders m where user_id = auth.uid()),
    'coach_requests', (select coalesce(json_agg(q), '[]') from milestones.coach_requests q where user_id = auth.uid()),
    'business', (select row_to_json(b) from milestones.businesses b where owner_id = auth.uid()))
$$;

-- Deletes all Recovery Milestones data for this person (cascades to every table).
-- The sign-in identity itself (auth.users) may be shared with other sites in the same project; see docs.
create or replace function milestones.delete_my_data() returns boolean
language plpgsql security definer set search_path = milestones, pg_catalog as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from milestones.profiles where id = auth.uid();
  return true;
end $$;

create or replace function milestones.request_coach(p_coach uuid, p_name text, p_email text, p_phone text, p_pref text, p_message text, p_consent boolean, p_consent_text text)
returns uuid language plpgsql security invoker set search_path = milestones, pg_catalog as $$
declare new_id uuid;
begin
  insert into milestones.coach_requests (coach_id, name, email, phone, preferred_contact, message, consent, consent_text)
    values (p_coach, p_name, nullif(trim(p_email), ''), nullif(trim(p_phone), ''), coalesce(p_pref, 'email'), p_message, p_consent, p_consent_text)
    returning id into new_id;
  return new_id;
end $$;

-- ---------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------
create or replace function milestones.public_businesses() returns json
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select coalesce(json_agg(x order by x.featured desc, x.name), '[]') from (
    select b.id, b.name, b.description, b.town, b.state, b.address, b.website, b.lat, b.lng,
           (b.featured and (b.featured_until is null or b.featured_until >= current_date)) as featured,
           case when b.featured then t.name end as tier_name,
           (select coalesce(json_agg(json_build_object('title', o.title, 'reward_type', o.reward_type, 'reward_value', o.reward_value, 'milestones', o.milestones, 'expires_on', o.expires_on)), '[]')
              from milestones.offers o where o.business_id = b.id and o.active and (o.expires_on is null or o.expires_on >= current_date)
                and (o.starts_on is null or o.starts_on <= current_date)) as offers
    from milestones.businesses b left join milestones.sponsor_tiers t on t.key = b.sponsor_tier
    where b.status = 'approved') x
$$;

create or replace function milestones.public_impact() returns json
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select json_build_object(
    'milestones_celebrated', milestones.suppress((select count(*) from milestones.badges)),
    'rewards_redeemed', milestones.suppress((select count(*) from milestones.reward_claims where status = 'redeemed')),
    'active_businesses', milestones.suppress((select count(*) from milestones.businesses b where status = 'approved'
         and exists (select 1 from milestones.offers o where o.business_id = b.id and o.active))),
    'supporters_engaged', milestones.suppress((select count(*) from milestones.supporters where not unsubscribed)
         + (select count(*) from milestones.wall_notes where supporter_id is null)),
    'members', milestones.suppress((select count(*) from milestones.profiles where role = 'member')),
    'updated_at', now())
$$;

-- ---------------------------------------------------------------------
-- Business RPCs
-- ---------------------------------------------------------------------
create or replace function milestones.become_business(p_name text, p_contact_email text, p_town text, p_state text, p_address text, p_website text, p_phone text, p_description text)
returns milestones.businesses language plpgsql security definer set search_path = milestones, pg_catalog as $$
declare b milestones.businesses; r text;
begin
  perform milestones.ensure_profile();
  if exists (select 1 from milestones.businesses where owner_id = auth.uid()) then raise exception 'You already have a business profile'; end if;
  select role into r from milestones.profiles where id = auth.uid();
  if r = 'member' then
    if exists (select 1 from milestones.reward_claims where user_id = auth.uid()) then
      raise exception 'Please use a separate sign-in for your business account';
    end if;
    update milestones.profiles set role = 'business' where id = auth.uid();
  end if;
  insert into milestones.businesses (owner_id, name, contact_email, town, state, address, website, phone, description)
    values (auth.uid(), p_name, p_contact_email, p_town, upper(nullif(p_state, '')), p_address, p_website, p_phone, p_description)
    returning * into b;
  return b;
end $$;

create or replace function milestones.business_claims()
returns table (code text, status text, milestone_key text, offer_title text, created_at timestamptz, redeemed_at timestamptz, expires_on date)
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select c.code, c.status, c.milestone_key, o.title, c.created_at, c.redeemed_at, c.expires_on
  from milestones.reward_claims c join milestones.offers o on o.id = c.offer_id
  where o.business_id = milestones.my_business_id() order by c.created_at desc limit 500
$$;

create or replace function milestones.redeem_code(p_code text) returns json
language plpgsql security definer set search_path = milestones, pg_catalog as $$
declare c milestones.reward_claims; t text; bid uuid := milestones.my_business_id();
begin
  if bid is null then raise exception 'Only business accounts can redeem codes'; end if;
  select rc.* into c from milestones.reward_claims rc join milestones.offers o on o.id = rc.offer_id
    where rc.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) and o.business_id = bid
    for update of rc;
  if c.id is null then raise exception 'Code not found for your business'; end if;
  select title into t from milestones.offers where id = c.offer_id;
  if c.status = 'redeemed' then
    return json_build_object('ok', false, 'reason', 'already_redeemed', 'offer_title', t, 'redeemed_at', c.redeemed_at);
  end if;
  if c.expires_on is not null and c.expires_on < current_date then
    return json_build_object('ok', false, 'reason', 'expired', 'offer_title', t, 'expires_on', c.expires_on);
  end if;
  update milestones.reward_claims set status = 'redeemed', redeemed_at = now() where id = c.id;
  return json_build_object('ok', true, 'offer_title', t, 'milestone_key', c.milestone_key, 'redeemed_at', now());
end $$;

create or replace function milestones.request_sponsorship(p_tier text) returns milestones.sponsorships
language plpgsql security definer set search_path = milestones, pg_catalog as $$
declare s milestones.sponsorships; bid uuid := milestones.my_business_id();
begin
  if bid is null then raise exception 'Create a business profile first'; end if;
  if not exists (select 1 from milestones.sponsor_tiers where key = p_tier and active) then raise exception 'Unknown tier'; end if;
  insert into milestones.sponsorships (business_id, tier_key) values (bid, p_tier) returning * into s;
  return s;
end $$;

-- ---------------------------------------------------------------------
-- Admin (aggregates only for reporting)
-- ---------------------------------------------------------------------
create or replace view milestones.admin_stats with (security_invoker = true) as
with events as (
  select date_trunc('month', created_at)::date as month, null::text as milestone_key, 'signups' as metric from milestones.profiles where role = 'member'
  union all select date_trunc('month', reached_on)::date, milestone_key, 'milestones_reached' from milestones.badges
  union all select date_trunc('month', created_at)::date, milestone_key, 'codes_issued' from milestones.reward_claims
  union all select date_trunc('month', redeemed_at)::date, milestone_key, 'codes_redeemed' from milestones.reward_claims where status = 'redeemed'
  union all select date_trunc('month', created_at)::date, milestone_key, 'cards_created' from milestones.celebration_cards
)
select month, coalesce(milestone_key, 'all') as milestone_key,
  count(*) filter (where metric = 'signups') as signups,
  count(*) filter (where metric = 'milestones_reached') as milestones_reached,
  count(*) filter (where metric = 'codes_issued') as codes_issued,
  count(*) filter (where metric = 'codes_redeemed') as codes_redeemed,
  count(*) filter (where metric = 'cards_created') as cards_created
from events group by 1, 2;
revoke all on milestones.admin_stats from anon, authenticated;

create or replace function milestones.admin_stats_report()
returns setof milestones.admin_stats language plpgsql stable security definer set search_path = milestones, pg_catalog as $$
begin
  if not milestones.is_admin() then raise exception 'Admins only'; end if;
  return query select * from milestones.admin_stats order by month desc, milestone_key;
end $$;

create or replace function milestones.admin_summary() returns json
language plpgsql stable security definer set search_path = milestones, auth, pg_catalog as $$
begin
  if not milestones.is_admin() then raise exception 'Admins only'; end if;
  return json_build_object(
    'members', (select count(*) from milestones.profiles where role = 'member'),
    'members_with_date', (select count(*) from milestones.profiles where role = 'member' and clean_date is not null),
    'active_members_90d', (select count(*) from milestones.profiles p join auth.users u on u.id = p.id
                           where p.role = 'member' and u.last_sign_in_at > now() - interval '90 days'),
    'checkins_30d', (select count(*) from milestones.checkins where day > current_date - 30),
    'businesses_approved', (select count(*) from milestones.businesses where status = 'approved'),
    'businesses_pending', (select count(*) from milestones.businesses where status = 'pending'),
    'businesses_featured', (select count(*) from milestones.businesses where featured),
    'offers_active', (select count(*) from milestones.offers where active and (expires_on is null or expires_on >= current_date)),
    'codes_issued', (select count(*) from milestones.reward_claims),
    'codes_redeemed', (select count(*) from milestones.reward_claims where status = 'redeemed'),
    'cards_created', (select count(*) from milestones.celebration_cards),
    'supporters', (select count(*) from milestones.supporters where not unsubscribed),
    'notes_left', (select count(*) from milestones.wall_notes),
    'email_optins', (select count(*) from milestones.notification_prefs where email_milestones),
    'coach_requests_open', (select count(*) from milestones.coach_requests where status <> 'closed'));
end $$;

create or replace function milestones.admin_businesses() returns json
language plpgsql stable security definer set search_path = milestones, pg_catalog as $$
begin
  if not milestones.is_admin() then raise exception 'Admins only'; end if;
  return (select coalesce(json_agg(json_build_object('id', b.id, 'name', b.name, 'town', b.town, 'contact_email', b.contact_email,
           'status', b.status, 'featured', b.featured, 'sponsor_tier', b.sponsor_tier, 'featured_until', b.featured_until,
           'offers', (select count(*) from milestones.offers o where o.business_id = b.id),
           'redeemed', (select count(*) from milestones.reward_claims c join milestones.offers o on o.id = c.offer_id where o.business_id = b.id and c.status = 'redeemed'),
           'sponsorship_requests', (select coalesce(json_agg(json_build_object('tier', s.tier_key, 'status', s.status, 'created_at', s.created_at)), '[]') from milestones.sponsorships s where s.business_id = b.id))
         order by b.status, b.created_at desc), '[]') from milestones.businesses b);
end $$;

create or replace function milestones.admin_set_business(p_id uuid, p_status text, p_featured boolean, p_tier text, p_featured_until date)
returns boolean language plpgsql security definer set search_path = milestones, pg_catalog as $$
begin
  if not milestones.is_admin() then raise exception 'Admins only'; end if;
  update milestones.businesses set status = coalesce(p_status, status), featured = coalesce(p_featured, featured),
    sponsor_tier = p_tier, featured_until = p_featured_until where id = p_id;
  return found;
end $$;

-- ---------------------------------------------------------------------
-- Service-only helpers for the milestone-notify edge function
-- ---------------------------------------------------------------------
create or replace function milestones.due_milestones(p_now timestamptz default now())
returns table (user_id uuid, email text, display_name text, milestone_key text, reached_on date, email_opt_in boolean, unsubscribe_token uuid)
language plpgsql security definer set search_path = milestones, auth, pg_catalog as $$
begin
  -- Record badges for everyone hitting a milestone today (in their own time zone).
  insert into milestones.badges (user_id, milestone_key, reached_on)
    select p.id, k, (p_now at time zone p.timezone)::date
    from milestones.profiles p, unnest(milestones.milestones_on(p.clean_date, (p_now at time zone p.timezone)::date)) k
    where p.clean_date is not null and p.role = 'member'
    on conflict do nothing;
  return query
    select p.id, u.email::text, p.display_name, k, (p_now at time zone p.timezone)::date, coalesce(n.email_milestones, false), n.unsubscribe_token
    from milestones.profiles p
    join auth.users u on u.id = p.id
    left join milestones.notification_prefs n on n.user_id = p.id
    cross join lateral unnest(milestones.milestones_on(p.clean_date, (p_now at time zone p.timezone)::date)) k
    where p.clean_date is not null and p.role = 'member';
end $$;

create or replace function milestones.offers_for_milestone(p_key text)
returns table (title text, description text, reward_type text, reward_value numeric, business_name text, town text, expires_on date, redemption_rules text)
language sql stable security definer set search_path = milestones, pg_catalog as $$
  select o.title, o.description, o.reward_type, o.reward_value, b.name, b.town, o.expires_on, o.redemption_rules
  from milestones.offers o join milestones.businesses b on b.id = o.business_id
  where o.active and b.status = 'approved' and (o.expires_on is null or o.expires_on >= current_date)
    and (o.starts_on is null or o.starts_on <= current_date)
    and exists (select 1 from unnest(o.milestones) t where milestones.target_matches(t, p_key))
  order by b.featured desc, o.created_at desc limit 20
$$;

create or replace function milestones.due_reminders(p_now timestamptz default now())
returns table (reminder_id uuid, user_id uuid, email text, label text, meet_time time, local_day date, unsubscribe_token uuid)
language sql stable security definer set search_path = milestones, auth, pg_catalog as $$
  select r.id, r.user_id, u.email::text, r.label, r.meet_time, (p_now at time zone p.timezone)::date, n.unsubscribe_token
  from milestones.meeting_reminders r
  join milestones.profiles p on p.id = r.user_id
  join auth.users u on u.id = r.user_id
  join milestones.notification_prefs n on n.user_id = r.user_id and n.email_reminders
  where r.active
    and extract(dow from (p_now at time zone p.timezone))::int = r.day_of_week
    and r.meet_time >= (p_now at time zone p.timezone)::time
    and r.meet_time < ((p_now at time zone p.timezone) + interval '75 minutes')::time  -- next ~hour (hourly cron)
    and (r.last_sent_on is null or r.last_sent_on < (p_now at time zone p.timezone)::date)
$$;

-- ---------------------------------------------------------------------
-- Function privileges (explicit allow-list)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema milestones from public, anon, authenticated;
grant execute on function milestones.my_role(), milestones.is_admin(), milestones.my_business_id(), milestones.business_is_approved(uuid), milestones.member_today(uuid) to anon, authenticated;
grant execute on function milestones.milestone_date(date, text), milestones.milestones_reached(date, date), milestones.milestones_on(date, date),
  milestones.target_matches(text, text), milestones.eligible_milestone(date, date, text[], int), milestones.is_milestone_key(text),
  milestones.suppress(bigint), milestones.short_code(int) to anon, authenticated;
grant execute on function milestones.get_card(uuid), milestones.public_wall(text), milestones.note_context(uuid), milestones.leave_note(uuid, text, text),
  milestones.unsubscribe(uuid), milestones.public_businesses(), milestones.public_impact() to anon, authenticated;
grant execute on function milestones.ensure_profile(), milestones.sync_my_badges(), milestones.check_in(), milestones.my_streak(), milestones.my_offers(),
  milestones.claim_reward(uuid), milestones.my_claims(), milestones.create_card(text, boolean, boolean, text), milestones.export_my_data(),
  milestones.delete_my_data(), milestones.request_coach(uuid, text, text, text, text, text, boolean, text),
  milestones.become_business(text, text, text, text, text, text, text, text), milestones.business_claims(), milestones.redeem_code(text),
  milestones.request_sponsorship(text), milestones.admin_stats_report(), milestones.admin_summary(), milestones.admin_businesses(),
  milestones.admin_set_business(uuid, text, boolean, text, date) to authenticated;
grant execute on all functions in schema milestones to service_role;

-- Starter sponsor tiers (edit prices any time in the Table Editor).
insert into milestones.sponsor_tiers (key, name, price_cents, billing_interval, perks, sort) values
  ('sprout', 'Sprout Sponsor', 2500, 'month', array['"Featured" badge on the rewards map', 'Listed first in offers'], 1),
  ('branch', 'Branch Sponsor', 5000, 'month', array['Everything in Sprout', 'Logo on the funder impact page', 'Highlighted in milestone emails'], 2),
  ('canopy', 'Canopy Sponsor', 10000, 'month', array['Everything in Branch', 'Homepage spotlight', 'Thank-you in Recovery Milestones newsletters'], 3)
on conflict (key) do nothing;
