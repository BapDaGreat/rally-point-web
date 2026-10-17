-- Follow-up to the Supabase database advisor fixes of 2026-10-17. Behaviour-preserving:
--   1. public_schedule, the last security-definer view, becomes a security-invoker
--      view over a definer function with the same query, like the five signed-in
--      views (lint 0010 security_definer_view). Anonymous TV boards still read it,
--      so the function lives in its own schema, board, which only anon and
--      authenticated may use and which the API does not expose.
--   2. Seventeen foreign keys get an index whose leading columns follow the key's
--      column order. 20261017160000 indexed the same columns in another order,
--      which Postgres can use but the advisor does not count
--      (lint 0001 unindexed_foreign_keys). One index from that migration is left
--      with no key to serve and is dropped.
--   3. service_role may run the functions behind the six views. Hosted staging gave
--      it SELECT on those views when they were created (local builds do not); a
--      definer view needed nothing more, but an invoker view does. Without this,
--      the views changed by 20261017160000 refuse it instead of returning rows.

do $guard$
begin
  if to_regprocedure('private.member_admin_rows()') is null
     or not exists (select 1 from pg_extension
                    where extname = 'btree_gist' and extnamespace = 'extensions'::regnamespace) then
    raise exception 'the advisor follow-up needs 20261017160000_supabase_advisor_fixes.sql first';
  end if;
end
$guard$;

-- 1. The schedule board: the same rows and columns, now behind a definer function.
create schema board authorization postgres;
comment on schema board is 'Not exposed through the API. Holds the definer function behind public.public_schedule.';
grant usage on schema board to anon, authenticated, service_role;

create function board.public_schedule_rows()
returns table (id uuid, club_id uuid, venue_id uuid, venue_name text, court_id uuid, court_name text,
  kind text, title text, start_at timestamptz, end_at timestamptz, status text, subtitle text)
language sql stable security definer set search_path = ''
as $$
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
$$;

revoke all on function board.public_schedule_rows() from public, anon, authenticated, service_role;
grant execute on function board.public_schedule_rows() to anon, authenticated, service_role;

-- CREATE OR REPLACE keeps the view's grants (anon and authenticated SELECT).
create or replace view public.public_schedule with (security_barrier = true, security_invoker = true)
  as select * from board.public_schedule_rows();

-- 2. Indexes in each foreign key's column order.
create index court_sessions_club_booking_idx on public.court_sessions (club_id, booking_id);
create index court_sessions_club_venue_booking_idx on public.court_sessions (club_id, venue_id, booking_id);
create index court_sessions_club_court_idx on public.court_sessions (club_id, court_id);
create index court_sessions_club_venue_court_idx on public.court_sessions (club_id, venue_id, court_id);
create index court_sessions_club_member_idx on public.court_sessions (club_id, member_id);
create index checkins_club_member_idx on public.checkins (club_id, member_id);
create index transactions_club_member_idx on public.transactions (club_id, member_id);
create index bookings_club_venue_court_idx on public.bookings (club_id, venue_id, court_id);
create index bookings_club_session_idx on public.bookings (club_id, session_id);
create index bookings_club_venue_session_idx on public.bookings (club_id, venue_id, session_id);
create index open_plays_club_court_idx on public.open_plays (club_id, court_id);
create index open_plays_club_venue_court_idx on public.open_plays (club_id, venue_id, court_id);
create index open_play_signups_club_member_idx on public.open_play_signups (club_id, member_id);
create index open_play_signups_club_play_idx on public.open_play_signups (club_id, open_play_id);
create index reminders_club_booking_idx on public.reminders (club_id, booking_id);
create index reminders_club_play_idx on public.reminders (club_id, open_play_id);
create index court_allocations_club_court_idx on public.court_allocations (club_id, court_id);

-- (open_play_id, club_id) now serves no key: the unique (open_play_id, member_id)
-- index covers open_play_id, and the index above covers (club_id, open_play_id).
drop index public.open_play_signups_play_club_idx;

-- 3. service_role runs the functions behind the views it may read. In private it can
--    then run these five and the five read-only access helpers PUBLIC can already run.
grant usage on schema private to service_role;
grant execute on function private.member_admin_rows(), private.member_roster_rows(), private.member_self_rows(),
  private.open_play_seat_counts_rows(), private.staff_accounts_rows() to service_role;
