begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select extensions.plan(30);

-- Fixture. Sign-up makes every user a Rally Point Gensan member.
--   user 1: Gensan member, admin of the synthetic second club and of a suspended club
--   user 2: Gensan member only
--   user 3: Gensan staff at the main venue, member of the second club
insert into auth.users (id, email, raw_user_meta_data)
select ('c1000000-0000-4000-8000-00000000000' || n)::uuid, 'ctx-' || n || '@fixture.invalid',
       jsonb_build_object('full_name', 'Context User ' || n)
from generate_series(1, 3) n;

insert into public.clubs (id, slug, name, is_active)
values ('c2000000-0000-4000-8000-000000000001', 'ctx-suspended', 'Context Suspended Club', false);

insert into public.club_staff_roles (club_id, user_id, role) values
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c1000000-0000-4000-8000-000000000001', 'admin'),
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'admin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000003', 'staff');
insert into public.staff_venue_grants (club_id, user_id, venue_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab');
insert into public.members (club_id, user_id, member_code, full_name, email, membership_type, status, join_date, expiry_date, qr_token)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c1000000-0000-4000-8000-000000000003', 'CTX-B3', 'Context User 3',
        'ctx-3@fixture.invalid', 'standard', 'active', current_date, current_date + 30, 'q_ctx_b3');
update public.members set member_code = 'CTX-REAL-1'
where user_id = 'c1000000-0000-4000-8000-000000000001' and club_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

insert into public.transactions (id, club_id, venue_id, amount, description) values
  ('c4000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 100, 'Context Gensan charge'),
  ('c4000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, 200, 'Context second-club charge');
insert into public.notifications (club_id, user_id, title, body) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000001', 'Context Gensan note', 'Gensan'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c1000000-0000-4000-8000-000000000001', 'Context second note', 'Second');
insert into public.open_plays (id, club_id, venue_id, court_id, title, start_at, end_at, capacity) values
  ('c5000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad', 'Context Gensan play', '2097-01-01 10:00+00', '2097-01-01 11:00+00', 8),
  ('c5000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbe', 'Context second play', '2097-01-01 10:00+00', '2097-01-01 11:00+00', 8);

-- Header resolution.
select extensions.is(private.current_club_id(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
  'no club header keeps the Rally Point Gensan default');
select set_config('request.headers', '{"x-club-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select extensions.is(private.current_club_id(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'a header naming an active club selects it');
select set_config('request.headers', '{"x-club-id":"  BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB "}', true);
select extensions.is(private.current_club_id(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'header matching ignores case and surrounding spaces');
select set_config('request.headers', '{"x-club-id":"00000000-0000-4000-8000-000000000000"}', true);
select extensions.is(private.current_club_id(), null::uuid, 'an unknown club header fails closed');
select set_config('request.headers', '{"x-club-id":"c2000000-0000-4000-8000-000000000001"}', true);
select extensions.is(private.current_club_id(), null::uuid, 'a suspended club header fails closed');
select set_config('request.headers', '{"x-club-id":""}', true);
select extensions.is(private.current_club_id(), null::uuid, 'an empty club header fails closed');
select set_config('request.headers', '{"x-club-id":"not-a-club"}', true);
select extensions.is(private.current_club_id(), null::uuid, 'a malformed club header fails closed');

-- User 1: a Gensan member who administers the second club.
select set_config('request.headers', '', true);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select extensions.is((select role::text from public.get_current_access()), 'member',
  'without a header user 1 acts as a Gensan member');

select set_config('request.headers', '{"x-club-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select extensions.is((select club_id::text || ':' || role::text from public.get_current_access()),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:admin', 'with the second club header user 1 acts as its admin');
select extensions.is((select count(*)::int from public.transactions where id = 'c4000000-0000-4000-8000-000000000002'), 1,
  'the second-club admin sees that club''s charge');
select extensions.is((select count(*)::int from public.transactions where id = 'c4000000-0000-4000-8000-000000000001'), 0,
  'the second-club admin does not see Gensan''s club-wide charge');
select extensions.ok((select count(*) from public.member_admin where club_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') >= 1,
  'the second-club admin can list that club''s members');
select extensions.is((select string_agg(title, ',') from public.notifications where title like 'Context % note'),
  'Context second note', 'notifications follow the active club');
select extensions.lives_ok(
  $$insert into public.support_inquiries (user_id, category, subject, message)
    values (auth.uid(), 'other', 'Context inquiry', 'Raised from the second club')$$,
  'an inquiry raised in the second club is accepted');
select extensions.is((select club_id from public.support_inquiries where subject = 'Context inquiry'),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, 'the inquiry is filed under the active club');

select set_config('request.headers', '{"x-club-id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
select extensions.is((select count(*)::int from public.member_admin), 0,
  'in Gensan user 1 is only a member, so there is no admin member list');
select extensions.is((select string_agg(title, ',') from public.notifications where title like 'Context % note'),
  'Context Gensan note', 'switching clubs switches the notifications shown');

select set_config('request.headers', '{"x-club-id":"c2000000-0000-4000-8000-000000000001"}', true);
select extensions.is((select count(*)::int from public.get_current_access()), 0,
  'a suspended club grants nothing, even to its admin');

-- User 2: a Gensan member forging the second club header.
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select set_config('request.headers', '{"x-club-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select extensions.is((select count(*)::int from public.get_current_access()), 0, 'a forged club header grants no role');
select extensions.is((select count(*)::int from public.transactions where id = 'c4000000-0000-4000-8000-000000000002'), 0,
  'a forged club header shows no club rows');
select extensions.throws_ok(
  $$select public.admin_upsert_venue(null::uuid, 'ctx-probe', 'Context Probe', 'Asia/Manila', 6::smallint, 22::smallint, true)$$,
  null::char(5), null::text, 'admin commands refuse a forged club header');

-- User 3: Gensan staff who is a member of the second club.
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
select set_config('request.headers', '', true);
select extensions.is((select role::text from public.get_current_access()), 'staff',
  'without a header user 3 acts as Gensan staff');
select set_config('request.headers', '{"x-club-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select extensions.is((select role::text from public.get_current_access()), 'member',
  'in the second club the same person is a member');

-- QR check-in must not reveal whether a code exists to someone without desk access.
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select set_config('request.headers', '', true);
select extensions.throws_ok(
  $$select public.check_in_qr('CTX-REAL-1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab')$$,
  'P0001', 'member or venue is outside assigned club', 'a real code is refused without desk access');
select extensions.throws_ok(
  $$select public.check_in_qr('CTX-NO-SUCH-CODE', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab')$$,
  'P0001', 'member or venue is outside assigned club', 'an unknown code gets the same refusal');

-- Anonymous TV boards follow the header.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.headers', '{"x-club-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select extensions.is((select count(*)::int from public.public_schedule where id = 'c5000000-0000-4000-8000-000000000002'), 1,
  'an anonymous board shows the named club''s open play');
select extensions.is((select count(*)::int from public.public_schedule where id = 'c5000000-0000-4000-8000-000000000001'), 0,
  'an anonymous board for the second club hides Gensan');
select set_config('request.headers', '', true);
select extensions.is(
  (select string_agg(id::text, ',') from public.public_schedule
   where id in ('c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002')),
  'c5000000-0000-4000-8000-000000000001', 'without a header the board stays on Gensan');
select set_config('request.headers', '{"x-club-id":"c2000000-0000-4000-8000-000000000001"}', true);
select extensions.is(
  (select count(*)::int from public.public_schedule
   where id in ('c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002')),
  0, 'a suspended club shows an empty board');

set local role postgres;
select extensions.ok(has_function_privilege('anon', 'private.current_club_id()', 'EXECUTE'),
  'anonymous boards keep EXECUTE on current_club_id');

select * from extensions.finish();
rollback;
