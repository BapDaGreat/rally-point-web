begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select extensions.plan(24);

-- Fixture: superadmins A (71) and B (72), and a player (73) who is also a
-- member of the synthetic second club, with a contact email support must not see.
insert into auth.users (id, email, raw_user_meta_data)
select ('c1000000-0000-4000-8000-0000000000' || n)::uuid, 'support-' || n || '@fixture.invalid',
       jsonb_build_object('full_name', 'Support User ' || n)
from generate_series(71, 73) n;
insert into public.platform_roles (user_id) values
  ('c1000000-0000-4000-8000-000000000071'), ('c1000000-0000-4000-8000-000000000072');
insert into public.members (club_id, user_id, member_code, full_name, email, membership_type, status, join_date, expiry_date, qr_token)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c1000000-0000-4000-8000-000000000073', 'SUPPORT-SECRET-CODE', 'Support User 73',
        'support-73-private@fixture.invalid', 'standard', 'active', current_date, current_date + 30, 'q_support_73');
insert into public.open_plays (id, club_id, venue_id, court_id, title, start_at, end_at, capacity)
values ('c5000000-0000-4000-8000-000000000071', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbe', 'Support noon play',
        date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' + interval '12 hours',
        date_trunc('day', now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' + interval '13 hours', 8);
insert into public.support_inquiries (club_id, user_id, category, subject, message)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c1000000-0000-4000-8000-000000000073', 'booking',
        'Court light broken', 'The light over court A flickers.');

-- Structure and privileges.
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.platform_support_sessions'::regclass)
  and not has_table_privilege('authenticated', 'public.platform_support_sessions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
  and not has_table_privilege('anon', 'public.platform_support_sessions', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'),
  'support sessions have row security and no API privileges');
select extensions.ok(
  (select bool_and(has_function_privilege('authenticated', f, 'EXECUTE') and not has_function_privilege('anon', f, 'EXECUTE'))
   from unnest(array[
     'public.platform_start_support_session(uuid, text, integer)', 'public.platform_end_support_session(uuid)',
     'public.platform_my_support_sessions()', 'public.platform_support_snapshot(uuid)']) f)
  and not has_function_privilege('authenticated', 'private.open_support_session(uuid)', 'EXECUTE'),
  'support functions are for signed-in users only, and the private helper is not callable');

-- A player cannot open one.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000073', true);
select extensions.throws_ok(
  $$select public.platform_start_support_session('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Just looking around here', 30)$$,
  '42501', 'Platform access required', 'players cannot open support sessions');

-- Superadmin A.
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000071', true);
select extensions.throws_ok(
  $$select public.platform_start_support_session('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'short', 30)$$,
  '22023', 'Give a reason of at least 10 characters', 'a session needs a real reason');
select extensions.throws_ok(
  $$select public.platform_start_support_session('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Checking a court complaint', 200)$$,
  '22023', 'Choose between 5 and 120 minutes', 'sessions last at most two hours');
select extensions.throws_ok(
  $$select public.platform_start_support_session('00000000-0000-4000-8000-000000000000', 'Checking a court complaint', 30)$$,
  'P0002', 'Club not found', 'sessions need a real club');
select extensions.ok(
  public.platform_start_support_session('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Checking a court complaint', 30) is not null,
  'a superadmin can open a support session with a reason');
select extensions.is((select count(*)::int from public.platform_my_support_sessions() where is_open), 1,
  'the new session is open');

select extensions.is(
  (select public.platform_support_snapshot((select id from public.platform_my_support_sessions() where is_open)) -> 'club' ->> 'name'),
  'Synthetic Second Club', 'the snapshot shows the session''s club');
select extensions.ok(
  (select public.platform_support_snapshot((select id from public.platform_my_support_sessions() where is_open)) -> 'today')
    @> '[{"kind":"open_play","court_name":"Synthetic Court A"}]'::jsonb,
  'the snapshot lists today''s schedule');
select extensions.ok(
  (select public.platform_support_snapshot((select id from public.platform_my_support_sessions() where is_open)) -> 'open_inquiries')
    @> '[{"subject":"Court light broken","status":"open"}]'::jsonb,
  'the snapshot lists open inquiries');
select extensions.is(
  (select jsonb_array_length(public.platform_support_snapshot((select id from public.platform_my_support_sessions() where is_open)) -> 'venues')),
  2, 'the snapshot lists the club''s venues');
select extensions.ok(
  (select position('support-73-private@fixture.invalid' in s::text) = 0 and position('SUPPORT-SECRET-CODE' in s::text) = 0
   from (select public.platform_support_snapshot((select id from public.platform_my_support_sessions() where is_open)) as s) x),
  'the snapshot carries no member contact details or codes');

set local role postgres;
select set_config('test.session_a', (
  select id::text from public.platform_support_sessions
  where actor_id = 'c1000000-0000-4000-8000-000000000071' and ended_at is null), true);

-- Superadmin B cannot use A's session.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000072', true);
select extensions.throws_ok(
  $$select public.platform_support_snapshot(current_setting('test.session_a')::uuid)$$,
  'P0002', 'Support session not found', 'one superadmin cannot use another''s session');

-- A new session replaces the open one.
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000071', true);
select extensions.ok(
  public.platform_start_support_session('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Looking at a schedule board issue', 15) is not null,
  'a superadmin can open a session for another club');
select extensions.is((select count(*)::int from public.platform_my_support_sessions() where is_open), 1,
  'only one session stays open');
select extensions.is((select count(*)::int from public.platform_my_support_sessions()), 2,
  'the earlier session is kept in the history');

set local role postgres;
select extensions.is(
  (select count(*)::int from public.platform_audit_log
   where actor_id = 'c1000000-0000-4000-8000-000000000071' and action = 'support.end' and details ->> 'ended_by' = 'new session'),
  1, 'replacing a session is logged');
select set_config('test.session_b', (
  select id::text from public.platform_support_sessions
  where actor_id = 'c1000000-0000-4000-8000-000000000071' and ended_at is null), true);
insert into public.platform_support_sessions (id, club_id, actor_id, reason, started_at, expires_at)
values ('c7000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c1000000-0000-4000-8000-000000000071',
        'An old session that ran out', now() - interval '3 hours', now() - interval '2 hours');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000071', true);
select extensions.lives_ok($$select public.platform_end_support_session(current_setting('test.session_b')::uuid)$$,
  'a superadmin can end their session');
select extensions.throws_ok(
  $$select public.platform_support_snapshot(current_setting('test.session_b')::uuid)$$,
  '42501', 'This support session has ended', 'an ended session shows nothing');
select extensions.throws_ok(
  $$select public.platform_end_support_session(current_setting('test.session_b')::uuid)$$,
  'P0002', 'Support session not found or already ended', 'ending twice is refused');
select extensions.throws_ok(
  $$select public.platform_support_snapshot('c7000000-0000-4000-8000-000000000001')$$,
  '42501', 'This support session has ended', 'an expired session shows nothing');
select extensions.throws_ok($$select * from public.platform_support_sessions$$, '42501', null,
  'superadmins cannot read the sessions table directly');

set local role postgres;
select extensions.is(
  (select string_agg(action || ':' || n, ',' order by action)
   from (select action, count(*) as n from public.platform_audit_log
         where actor_id = 'c1000000-0000-4000-8000-000000000071' and action like 'support.%'
         group by action) t),
  'support.end:2,support.read:5,support.start:2',
  'every start, look and end was logged once, and refused attempts were not');

select * from extensions.finish();
rollback;
