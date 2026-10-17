begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select extensions.plan(17);

-- Structure: what the Supabase advisor checks.
select extensions.is(
  (select count(*)::int from pg_constraint c
   where c.contype = 'f' and c.connamespace = 'public'::regnamespace
     and not exists (select 1 from pg_index i
                     where i.indrelid = c.conrelid and i.indisvalid
                       and (string_to_array(i.indkey::text, ' ')::smallint[])[1:cardinality(c.conkey)] = c.conkey)),
  0, 'every foreign key has an index in its own column order');
select extensions.is(
  (select count(*)::int from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
     and not ('security_invoker=true' = any(coalesce(c.reloptions, '{}')))),
  0, 'no public view runs with its owner''s rights');
select extensions.ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
   where p.oid = 'board.public_schedule_rows()'::regprocedure),
  'the schedule function is security definer with an empty search path');
select extensions.ok(
  (select count(*) from pg_proc where pronamespace = 'board'::regnamespace) = 1
  and not exists (select 1 from pg_class where relnamespace = 'board'::regnamespace),
  'the board schema holds only the schedule function');

-- Privileges: the same callers as before, and nothing new.
select extensions.ok(
  has_table_privilege('anon', 'public.public_schedule', 'SELECT')
  and has_table_privilege('authenticated', 'public.public_schedule', 'SELECT'),
  'anonymous boards and signed-in users can read the schedule, as before');
select extensions.ok(
  has_function_privilege('anon', 'board.public_schedule_rows()', 'EXECUTE')
  and has_function_privilege('authenticated', 'board.public_schedule_rows()', 'EXECUTE')
  and has_function_privilege('service_role', 'board.public_schedule_rows()', 'EXECUTE')
  and not has_function_privilege('public', 'board.public_schedule_rows()', 'EXECUTE'),
  'only the API roles may run the schedule function');
select extensions.ok(
  has_schema_privilege('service_role', 'private', 'USAGE')
  and (select bool_and(has_function_privilege('service_role', f, 'EXECUTE'))
       from unnest(array['private.member_admin_rows()', 'private.member_roster_rows()', 'private.member_self_rows()',
                         'private.open_play_seat_counts_rows()', 'private.staff_accounts_rows()']) f),
  'service_role can run the functions behind the signed-in views');
select extensions.ok(
  has_schema_privilege('anon', 'board', 'USAGE') and not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous callers reach the board schema but still not the private schema');
select extensions.ok(
  not has_table_privilege('anon', 'public.court_sessions', 'SELECT')
  and not has_table_privilege('anon', 'public.bookings', 'SELECT')
  and not has_table_privilege('anon', 'public.open_plays', 'SELECT'),
  'anonymous callers still cannot read the schedule tables directly');

-- Behaviour: boards show exactly what the old definer view showed.
insert into public.members (id, club_id, member_code, full_name, expiry_date) values
  ('af000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AF-1', 'Followup Member A', date '2026-12-31'),
  ('af000000-0000-4000-8000-000000000002', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'AF-2', 'Followup Member B', date '2026-12-31');
insert into public.court_sessions (id, club_id, venue_id, court_id, start_at, end_at, status) values
  ('af100000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad', timestamptz '2026-11-02 08:00+08', timestamptz '2026-11-02 09:00+08', 'playing'),
  ('af100000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae', timestamptz '2026-11-02 10:00+08', timestamptz '2026-11-02 11:00+08', 'scheduled'),
  ('af100000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad', timestamptz '2026-11-01 08:00+08', timestamptz '2026-11-01 09:00+08', 'completed'),
  ('af100000-0000-4000-8000-000000000004', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbe', timestamptz '2026-11-02 08:00+08', timestamptz '2026-11-02 09:00+08', 'pending_payment');
insert into public.bookings (id, club_id, venue_id, court_id, member_id, start_at, end_at, hours, status) values
  ('af200000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae', 'af000000-0000-4000-8000-000000000001',
   timestamptz '2026-11-02 12:00+08', timestamptz '2026-11-02 13:00+08', 1, 'confirmed'),
  ('af200000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad', 'af000000-0000-4000-8000-000000000001',
   timestamptz '2026-11-02 14:00+08', timestamptz '2026-11-02 15:00+08', 1, 'cancelled'),
  ('af200000-0000-4000-8000-000000000003', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbe', 'af000000-0000-4000-8000-000000000002',
   timestamptz '2026-11-02 12:00+08', timestamptz '2026-11-02 13:00+08', 1, 'pending_payment');
insert into public.open_plays (id, club_id, venue_id, court_id, title, start_at, end_at, status) values
  ('af300000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad', 'Followup open play', timestamptz '2026-11-02 16:00+08', timestamptz '2026-11-02 18:00+08', 'open'),
  ('af300000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
   null, 'Followup full play', timestamptz '2026-11-02 18:00+08', timestamptz '2026-11-02 20:00+08', 'full'),
  ('af300000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',
   null, 'Followup cancelled play', timestamptz '2026-11-03 16:00+08', timestamptz '2026-11-03 18:00+08', 'cancelled'),
  ('af300000-0000-4000-8000-000000000004', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbe', 'Followup B open play', timestamptz '2026-11-02 16:00+08', timestamptz '2026-11-02 18:00+08', 'open');

-- The old definer view's query, run as its owner, digested in a fixed order.
create function pg_temp.old_board() returns text language sql as $$
  select coalesce(md5(string_agg(row_to_json(q)::text, '|' order by q.kind, q.id)), 'no rows') from (
    select s.id, s.club_id, s.venue_id, v.name as venue_name, s.court_id, c.name as court_name,
           'session'::text as kind, 'In use'::text as title,
           s.start_at, s.end_at,
           case when s.status = 'playing' then 'playing' else 'scheduled' end::text as status,
           case when s.status = 'playing' then 'playing' else 'scheduled' end::text as subtitle
    from public.court_sessions s
    join public.courts c on c.id = s.court_id and c.club_id = s.club_id
    join public.venues v on v.id = s.venue_id and v.club_id = s.club_id
    where s.club_id = private.current_club_id()
      and s.status in ('scheduled', 'playing', 'pending_payment')
    union all
    select b.id, b.club_id, b.venue_id, v.name, b.court_id, c.name,
           'booking'::text, 'Reserved'::text,
           b.start_at, b.end_at, 'reserved'::text, 'reserved'::text
    from public.bookings b
    join public.courts c on c.id = b.court_id and c.club_id = b.club_id
    join public.venues v on v.id = b.venue_id and v.club_id = b.club_id
    where b.club_id = private.current_club_id()
      and b.session_id is null and b.status in ('pending_payment', 'confirmed')
    union all
    select o.id, o.club_id, o.venue_id, v.name, o.court_id, c.name,
           'open_play'::text, 'Open play'::text,
           o.start_at, o.end_at, o.status::text, (o.capacity::text || ' seats')::text
    from public.open_plays o
    left join public.courts c on c.id = o.court_id and c.club_id = o.club_id
    join public.venues v on v.id = o.venue_id and v.club_id = o.club_id
    where o.club_id = private.current_club_id() and o.status in ('open', 'full')
  ) q
$$;

-- No club header: the default club.
select set_config('request.headers', '', true);
select set_config('test.expected', pg_temp.old_board(), true);
set local role anon;
select extensions.is(
  (select coalesce(md5(string_agg(row_to_json(p)::text, '|' order by p.kind, p.id)), 'no rows') from public.public_schedule p),
  current_setting('test.expected'), 'an anonymous board shows exactly what the old view showed for the default club');
select extensions.is((select count(*)::int from public.public_schedule), 5,
  'the default club board lists its two live sessions, one booking and two open plays');

-- The second club, chosen by header.
set local role postgres;
select set_config('request.headers', '{"x-club-id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
select set_config('test.expected', pg_temp.old_board(), true);
set local role anon;
select extensions.is(
  (select coalesce(md5(string_agg(row_to_json(p)::text, '|' order by p.kind, p.id)), 'no rows') from public.public_schedule p),
  current_setting('test.expected'), 'a board for the second club shows exactly what the old view showed');
select extensions.is((select count(*)::int from public.public_schedule), 3,
  'the second club board lists only its own session, booking and open play');

-- An unknown club fails closed.
set local role postgres;
select set_config('request.headers', '{"x-club-id":"00000000-0000-4000-8000-000000000000"}', true);
set local role anon;
select extensions.is((select count(*)::int from public.public_schedule), 0, 'an unknown club shows an empty board');

-- Signed-in users see the same board.
set local role postgres;
select set_config('request.headers', '', true);
select set_config('test.expected', pg_temp.old_board(), true);
set local role authenticated;
select extensions.is(
  (select coalesce(md5(string_agg(row_to_json(p)::text, '|' order by p.kind, p.id)), 'no rows') from public.public_schedule p),
  current_setting('test.expected'), 'signed-in users see the same board as before');

-- service_role, with the SELECT grants hosted staging gave it on these views.
set local role postgres;
grant select on public.public_schedule, public.member_admin, public.member_roster, public.member_self,
  public.open_play_seat_counts, public.staff_accounts to service_role;
select set_config('test.expected', pg_temp.old_board(), true);
set local role service_role;
select extensions.is(
  (select coalesce(md5(string_agg(row_to_json(p)::text, '|' order by p.kind, p.id)), 'no rows') from public.public_schedule p),
  current_setting('test.expected'), 'service_role reads the same board as before');
select extensions.is(
  (select count(*)::int from public.member_admin) + (select count(*)::int from public.member_roster)
  + (select count(*)::int from public.member_self) + (select count(*)::int from public.open_play_seat_counts)
  + (select count(*)::int from public.staff_accounts),
  0, 'service_role reads the signed-in views without an error and, with nobody signed in, gets no rows, as before');

select * from extensions.finish();
rollback;
