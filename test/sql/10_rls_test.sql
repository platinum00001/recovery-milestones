-- Local RLS / RPC behaviour tests (run after 00_supabase_stub.sql, 001_init.sql, seed.sql). LOCAL TESTING ONLY.
\set ON_ERROR_STOP 1
\set A '''00000000-0000-4000-8000-0000000000a1'''
\set B '''00000000-0000-4000-8000-0000000000b2'''
\set C '''00000000-0000-4000-8000-0000000000c3'''
\set ADM '''00000000-0000-4000-8000-0000000000ad'''
\set BIZ1 '''00000000-0000-4000-8000-00000000b001'''
\set BIZ2 '''00000000-0000-4000-8000-00000000b002'''

insert into auth.users (id, email, last_sign_in_at) values
  (:A, 'a@test.local', now()), (:B, 'b@test.local', now()), (:C, 'c@test.local', now()), (:ADM, 'admin@test.local', now());

create or replace function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'EXPECTED ERROR containing "%" but statement succeeded: %', needle, sql;
exception when others then
  if sqlerrm like 'EXPECTED ERROR%' then raise; end if;
  if position(lower(needle) in lower(sqlerrm)) = 0 then raise exception 'Wrong error for %: % (wanted %)', sql, sqlerrm, needle; end if;
  raise notice 'ok (expected error): %', sqlerrm;
end $$;
grant execute on function pg_temp.expect_error(text, text) to public;

-- ---------- member A ----------
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
select (milestones.ensure_profile()).role = 'member' as a_is_member \gset
update milestones.profiles set clean_date = current_date - 95, display_name = 'Alex' where id = auth.uid();
select pg_temp.expect_error($$update milestones.profiles set role = 'admin'$$, 'permission denied');
select pg_temp.expect_error($$update milestones.profiles set clean_date = current_date + 10$$, 'future');
select count(*) = 4 as a_badges from milestones.sync_my_badges() \gset
\if :a_badges \echo 'PASS badges synced (h24,d30,d60,d90)' \else \echo 'FAIL badges' \quit \endif

select title, eligible_key, my_claims from milestones.my_offers() order by title;
select (select eligible_key from milestones.my_offers() where title like 'Free coffee%') = 'd90' as coffee_ok \gset
\if :coffee_ok \echo 'PASS coffee offer eligible via d90' \else \echo 'FAIL coffee eligibility' \quit \endif

select code as a_code from milestones.claim_reward((select id from milestones.offers where title like 'Free coffee%')) \gset
\echo 'claimed code' :a_code
select pg_temp.expect_error(format('select milestones.claim_reward(%L)', (select id from milestones.offers where title like 'Free coffee%')), 'already claimed');
select pg_temp.expect_error(format('select milestones.claim_reward(%L)', (select id from milestones.offers where title like '20%%')), 'milestone you reached');
select pg_temp.expect_error($$insert into milestones.reward_claims (offer_id, user_id, milestone_key, code) select id, auth.uid(), 'y9', 'HACK1234' from milestones.offers limit 1$$, 'permission denied');
select pg_temp.expect_error($$select milestones.admin_summary()$$, 'admins only');
select pg_temp.expect_error($$select * from milestones.admin_stats$$, 'permission denied');
select pg_temp.expect_error($$select * from milestones.notification_log$$, 'permission denied');

-- supporters need consent
select pg_temp.expect_error($$insert into milestones.supporters (name, email, consent_confirmed) values ('Pat', 'pat@test.local', false)$$, 'check constraint');
insert into milestones.supporters (name, email, relationship, notify_on_milestones, consent_confirmed) values ('Pat', 'pat@test.local', 'sponsor', true, true);
select pg_temp.expect_error($$select note_token from milestones.supporters$$, 'permission denied');
insert into milestones.meeting_reminders (label, day_of_week, meet_time) values ('Home group', 2, '19:00');
select (milestones.check_in()->>'current')::int = 1 as streak_ok \gset
\if :streak_ok \echo 'PASS check-in streak = 1' \else \echo 'FAIL streak' \quit \endif
select milestones.create_card('d90', false, false, 'One day at a time') as card_id \gset
select pg_temp.expect_error($$select milestones.create_card('y1', true, true, null)$$, 'reached');
select milestones.request_coach(null, 'Alex', 'a@test.local', null, 'email', 'Looking for a coach', true, 'I agree to be contacted');
select pg_temp.expect_error($$select milestones.request_coach(null, 'Alex', 'a@test.local', null, 'email', 'x', false, 't')$$, 'check constraint');
select pg_temp.expect_error($$select milestones.become_business('Biz', null, null, null, null, null, null, null)$$, 'separate sign-in');

-- ---------- member B cannot see A ----------
select set_config('request.jwt.claim.sub', :B, false);
select milestones.ensure_profile() is not null;
select (select count(*) from milestones.profiles) = 1 and (select count(*) from milestones.reward_claims) = 0
   and (select count(*) from milestones.supporters) = 0 and (select count(*) from milestones.coach_requests) = 0 as b_isolated \gset
\if :b_isolated \echo 'PASS member B sees only own rows' \else \echo 'FAIL isolation' \quit \endif
update milestones.wall_notes set status = 'approved';  -- affects 0 rows for B (RLS)

-- ---------- business 1 redeems A's code; business 2 cannot ----------
select set_config('request.jwt.claim.sub', :BIZ2, false);
select pg_temp.expect_error(format('select milestones.redeem_code(%L)', :'a_code'), 'not found for your business');
select set_config('request.jwt.claim.sub', :BIZ1, false);
select count(*) = 1 as biz_sees_claim from milestones.business_claims() \gset
\if :biz_sees_claim \echo 'PASS business sees its claim (no member identity columns)' \else \echo 'FAIL business claims' \quit \endif
select (select count(*) from milestones.reward_claims) = 0 as biz_no_raw_claims \gset
\if :biz_no_raw_claims \echo 'PASS business cannot read raw reward_claims rows' \else \echo 'FAIL raw claims visible' \quit \endif
select (milestones.redeem_code(lower(:'a_code'))->>'ok')::boolean as redeemed \gset
\if :redeemed \echo 'PASS code redeemed (case-insensitive)' \else \echo 'FAIL redeem' \quit \endif
select (milestones.redeem_code(:'a_code')->>'reason') = 'already_redeemed' as twice \gset
\if :twice \echo 'PASS second redemption refused' \else \echo 'FAIL double redeem' \quit \endif
select pg_temp.expect_error($$update milestones.businesses set status = 'approved', featured = true$$, 'permission denied');
update milestones.businesses set lat = 41.55, lng = -70.61 where owner_id = auth.uid();
insert into milestones.offers (business_id, title, reward_type, milestones) values (milestones.my_business_id(), 'Test offer', 'free_item', array['d30']);
select pg_temp.expect_error($$insert into milestones.offers (business_id, title, reward_type, milestones) values ('00000000-0000-4000-8000-0000000b0002', 'Hijack', 'free_item', array['d30'])$$, 'row-level security');
select pg_temp.expect_error($$insert into milestones.offers (business_id, title, reward_type, milestones) values (milestones.my_business_id(), 'Bad target', 'free_item', array['y7'])$$, 'check constraint');
select (milestones.request_sponsorship('branch')).status = 'requested' as spons \gset
\if :spons \echo 'PASS sponsorship request recorded' \else \echo 'FAIL sponsorship' \quit \endif

-- ---------- anonymous visitor ----------
reset role; set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($$select * from milestones.profiles$$, 'permission denied');
select pg_temp.expect_error($$select * from milestones.reward_claims$$, 'permission denied');
select pg_temp.expect_error($$select * from milestones.businesses$$, 'permission denied');
select pg_temp.expect_error($$select milestones.claim_reward(gen_random_uuid())$$, 'permission denied');
select json_array_length(milestones.public_businesses()) = 3 as pub_biz \gset
\if :pub_biz \echo 'PASS public business list (approved only)' \else \echo 'FAIL public businesses' \quit \endif
select milestones.public_impact();
select (milestones.public_impact()->>'rewards_redeemed') = '<10' as suppressed \gset
\if :suppressed \echo 'PASS impact numbers suppressed under 10' \else \echo 'FAIL suppression' \quit \endif
select (milestones.get_card(:'card_id')->>'milestone_date') is null and (milestones.get_card(:'card_id')->>'display_name') is null as card_private \gset
\if :card_private \echo 'PASS card hides name and date by default' \else \echo 'FAIL card privacy' \quit \endif
select (select count(*) from milestones.offers) = 4 as anon_offers \gset
\if :anon_offers \echo 'PASS anon sees only live offers of approved businesses' \else \echo 'FAIL anon offers' \quit \endif

-- supporter leaves a note via email token (looked up as postgres)
reset role;
select note_token as tok, (select wall_slug from milestones.profiles where id = :A) as slug from milestones.supporters where user_id = :A \gset
set role anon;
select milestones.note_context(:'tok');
select milestones.leave_note(:'tok', 'Pat (sponsor)', 'So proud of you!');
select (milestones.public_wall(:'slug')->>'private')::boolean as wall_private \gset
\if :wall_private \echo 'PASS wall private by default' \else \echo 'FAIL wall default' \quit \endif

-- A moderates and opts in
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
update milestones.wall_notes set status = 'approved';
update milestones.profiles set wall_public = true;
reset role; set role anon;
select milestones.public_wall(:'slug');
select json_array_length(milestones.public_wall(:'slug')->'notes') = 1 and (milestones.public_wall(:'slug')->>'clean_date') is null as wall_ok \gset
\if :wall_ok \echo 'PASS public wall shows approved note, hides date' \else \echo 'FAIL wall' \quit \endif

-- ---------- admin ----------
reset role;
insert into milestones.profiles (id, role) values (:ADM, 'admin');
set role authenticated;
select set_config('request.jwt.claim.sub', :ADM, false);
select milestones.admin_summary();
select count(*) > 0 as stats from milestones.admin_stats_report() \gset
\if :stats \echo 'PASS admin stats report' \else \echo 'FAIL admin stats' \quit \endif
select milestones.admin_set_business('00000000-0000-4000-8000-0000000b0002', 'approved', true, 'branch', current_date + 30);
select (select count(*) from milestones.coach_requests) = 1 as adm_req \gset
\if :adm_req \echo 'PASS admin sees coach requests for follow-up' \else \echo 'FAIL coach req' \quit \endif

-- ---------- service role: due milestones + reminders ----------
reset role;
insert into milestones.profiles (id, clean_date) values (:C, (now() at time zone 'America/New_York')::date - 30);
insert into milestones.notification_prefs (user_id, email_milestones, email_reminders) values (:C, true, true);
insert into milestones.meeting_reminders (user_id, label, day_of_week, meet_time)
  values (:C, 'Tuesday night meeting', extract(dow from now() at time zone 'America/New_York')::int,
          ((now() at time zone 'America/New_York') + interval '30 minutes')::time);
set role service_role;
select * from milestones.due_milestones(now());
select count(*) = 1 as due_c from milestones.due_milestones(now()) where user_id = :C and milestone_key = 'd30' \gset
\if :due_c \echo 'PASS due_milestones finds 30-day milestone today' \else \echo 'FAIL due milestones' \quit \endif
select count(*) >= 1 as offers_c from milestones.offers_for_milestone('d30') \gset
\if :offers_c \echo 'PASS offers_for_milestone' \else \echo 'FAIL offers_for_milestone' \quit \endif
select count(*) = 1 as rem from milestones.due_reminders(now()) \gset
\if :rem \echo 'PASS due_reminders finds meeting in next hour' \else \echo 'FAIL reminders (may fail within 30 min of local midnight)' \endif

-- ---------- unsubscribe + delete ----------
reset role;
select unsubscribe_token as ut from milestones.notification_prefs where user_id = :C \gset
set role anon;
select milestones.unsubscribe(:'ut') as unsub \gset
\if :unsub \echo 'PASS one-click unsubscribe' \else \echo 'FAIL unsubscribe' \quit \endif
reset role; set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
select json_array_length(milestones.export_my_data()->'reward_claims') = 1 as exp \gset
\if :exp \echo 'PASS data export' \else \echo 'FAIL export' \quit \endif
select milestones.delete_my_data();
reset role;
select (select count(*) from milestones.supporters where user_id = :A) + (select count(*) from milestones.reward_claims where user_id = :A)
     + (select count(*) from milestones.badges where user_id = :A) + (select count(*) from milestones.coach_requests where user_id = :A) = 0 as gone \gset
\if :gone \echo 'PASS delete_my_data removes all member rows' \else \echo 'FAIL delete' \quit \endif
\echo 'ALL SQL TESTS PASSED'
