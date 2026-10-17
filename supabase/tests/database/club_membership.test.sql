begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select extensions.plan(24);

insert into public.clubs (id, slug, name, is_active)
values ('c2000000-0000-4000-8000-000000000021', 'mem-closed', 'Membership Closed Club', false);

-- Sign-up through a join link joins only that club.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-4000-8000-000000000011', 'mem-11@fixture.invalid',
   '{"full_name":"Member Eleven","club_slug":"synthetic-second-club"}');
select extensions.is(
  (select count(*)::int from public.members where user_id = 'c1000000-0000-4000-8000-000000000011' and club_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1, 'a join-link sign-up becomes a member of that club');
select extensions.is(
  (select count(*)::int from public.members where user_id = 'c1000000-0000-4000-8000-000000000011' and club_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0, 'a join-link sign-up does not also join Gensan');

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-4000-8000-000000000015', 'mem-15@fixture.invalid',
   '{"full_name":"Member Fifteen","club_slug":"  Synthetic-Second-Club "}');
select extensions.is(
  (select count(*)::int from public.members where user_id = 'c1000000-0000-4000-8000-000000000015' and club_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1, 'join-link slugs ignore case and surrounding spaces');

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-4000-8000-000000000012', 'mem-12@fixture.invalid', '{"full_name":"Member Twelve"}');
select extensions.is(
  (select count(*)::int from public.members where user_id = 'c1000000-0000-4000-8000-000000000012' and club_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1, 'a sign-up without a club link joins Rally Point Gensan');

select extensions.throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('c1000000-0000-4000-8000-000000000016', 'mem-16@fixture.invalid', '{"full_name":"Bad Link","club_slug":"no-such-club"}')$$,
  '22023', 'This club link is not valid', 'an unknown club link fails the sign-up');
select extensions.throws_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('c1000000-0000-4000-8000-000000000017', 'mem-17@fixture.invalid', '{"full_name":"Closed Link","club_slug":"mem-closed"}')$$,
  '22023', 'This club link is not valid', 'an inactive club link fails the sign-up');

-- With the default club closed, sign-up keeps the profile and skips the membership.
update public.clubs set is_active = false where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select extensions.lives_ok(
  $$insert into auth.users (id, email, raw_user_meta_data) values
    ('c1000000-0000-4000-8000-000000000013', 'mem-13@fixture.invalid', '{"full_name":"Member Thirteen"}')$$,
  'sign-up still works while the default club is closed');
select extensions.is((select count(*)::int from public.profiles where id = 'c1000000-0000-4000-8000-000000000013'), 1,
  'the profile is created');
select extensions.is((select count(*)::int from public.members where user_id = 'c1000000-0000-4000-8000-000000000013'), 0,
  'no membership is created in a closed club');
update public.clubs set is_active = true where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Public club lookup.
set local role anon;
select extensions.is((select name from public.get_public_club('synthetic-second-club')), 'Synthetic Second Club',
  'anonymous visitors can look up an active club by its link');
select extensions.is(
  (select count(*)::int from jsonb_object_keys((select to_jsonb(g) from public.get_public_club('synthetic-second-club') g))),
  3, 'the public lookup returns only id, slug and name');
select extensions.is((select count(*)::int from public.get_public_club('mem-closed')), 0,
  'inactive clubs are not found by the public lookup');
set local role postgres;
select extensions.ok(not has_table_privilege('anon', 'public.clubs', 'SELECT'),
  'anonymous visitors still cannot read the clubs table');

-- list_my_clubs ignores the club header and skips inactive clubs.
insert into public.members (club_id, user_id, member_code, full_name, email, membership_type, status, join_date, expiry_date, qr_token) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c1000000-0000-4000-8000-000000000011', 'MEM-A11', 'Member Eleven',
   'mem-11@fixture.invalid', 'standard', 'active', current_date, current_date + 30, 'q_mem_a11'),
  ('c2000000-0000-4000-8000-000000000021', 'c1000000-0000-4000-8000-000000000011', 'MEM-C11', 'Member Eleven',
   'mem-11@fixture.invalid', 'standard', 'active', current_date, current_date + 30, 'q_mem_c11');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000011', true);
select set_config('request.headers', '{"x-club-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select extensions.is((select count(*)::int from public.list_my_clubs()), 2,
  'a two-club member sees both active clubs');
select set_config('request.headers', '{"x-club-id":"not-a-club"}', true);
select extensions.is((select count(*)::int from public.list_my_clubs()), 2,
  'the club list does not depend on the club header');
select extensions.is(
  (select string_agg(slug || ':' || role::text, ',' order by slug) from public.list_my_clubs()),
  'rally-point-gensan:member,synthetic-second-club:member', 'each club is listed with the person''s role there');
set local role postgres;
select extensions.ok(not has_function_privilege('anon', 'public.list_my_clubs()', 'EXECUTE'),
  'anonymous visitors cannot call list_my_clubs');

-- join_club adds one membership in another active club.
set local role authenticated;
select set_config('request.headers', '', true);
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000012', true);
select extensions.is(public.join_club('synthetic-second-club'), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'a signed-in member can join another active club');
select extensions.is(public.join_club('Synthetic-Second-Club'), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,
  'joining again is harmless');
select extensions.is((select count(*)::int from public.list_my_clubs()), 2,
  'joining twice still gives one membership per club');
select extensions.throws_ok($$select public.join_club('mem-closed')$$, '22023', 'This club link is not valid',
  'inactive clubs cannot be joined');
set local role postgres;
select extensions.ok(not has_function_privilege('anon', 'public.join_club(text)', 'EXECUTE'),
  'anonymous visitors cannot call join_club');

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-4000-8000-000000000014', 'mem-14@fixture.invalid', '{"full_name":"Platform Person"}');
insert into public.platform_roles (user_id, role) values ('c1000000-0000-4000-8000-000000000014', 'superadmin');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000014', true);
select extensions.throws_ok($$select public.join_club('synthetic-second-club')$$, '42501', 'Platform accounts cannot join clubs',
  'platform accounts cannot join clubs');
select set_config('request.jwt.claim.sub', '', true);
select extensions.throws_ok($$select public.join_club('synthetic-second-club')$$, '42501', 'Please sign in to join a club',
  'joining needs a signed-in person');

select * from extensions.finish();
rollback;
