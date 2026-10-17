-- Fixes for the Supabase database advisor findings of 2026-10-17. Behaviour-preserving:
--   1. Row-level security policies read auth.uid() and the current club once per
--      statement instead of once per row (lint 0003 auth_rls_initplan).
--   2. venues has one SELECT policy for signed-in users instead of two with the
--      same combined meaning (lint 0006 multiple_permissive_policies).
--   3. btree_gist moves out of the API schema (lint 0014 extension_in_public).
--   4. Every foreign key gets a covering index; column order lets one index
--      cover several keys (lint 0001 unindexed_foreign_keys).
--   5. Tables reachable only through audited functions say so with explicit
--      deny policies (lint 0008 rls_enabled_no_policy). Nothing gains access.
--   6. Five signed-in views become security-invoker views over private
--      SECURITY DEFINER functions with the same predicates (lint 0010
--      security_definer_view). public_schedule stays a definer view on purpose:
--      anonymous TV boards read it, and anonymous users have no access to the
--      private schema.

do $guard$
begin
  if to_regclass('public.platform_support_sessions') is null
     or not exists (select 1 from pg_constraint
                    where conrelid = 'public.members'::regclass and conname = 'members_club_user_key') then
    raise exception 'advisor fixes need tenant enforcement and the club platform migrations first';
  end if;
end
$guard$;

-- 1. Evaluate the caller and the current club once per statement.
alter policy members_self_select on public.members
  using (club_id = (select private.current_club_id()) and user_id = (select auth.uid()));
alter policy notifications_own_select on public.notifications
  using (club_id = (select private.current_club_id()) and user_id = (select auth.uid()));
alter policy profiles_select_self on public.profiles
  using (id = (select auth.uid()));
alter policy reminders_own_select on public.reminders
  using (club_id = (select private.current_club_id()) and user_id = (select auth.uid()));
alter policy inquiries_insert_staff_admin on public.support_inquiries
  with check (
    club_id = (select private.current_club_id())
    and private.current_club_role(club_id) = any (array['staff', 'admin']::public.user_role[])
    and user_id = (select auth.uid())
  );
alter policy inquiries_read_own_or_admin on public.support_inquiries
  using (
    club_id = (select private.current_club_id())
    and (user_id = (select auth.uid()) or private.current_club_role(club_id) = 'admin'::public.user_role)
  );

-- 2. One SELECT policy on venues for signed-in users: assigned venues, or every
--    venue of the current club for its admins (the two previous policies, combined).
drop policy venues_admin_select_all on public.venues;
drop policy venues_select_current_authenticated on public.venues;
create policy venues_select_authenticated on public.venues
  for select to authenticated
  using (
    private.can_access_venue(club_id, id)
    or (club_id = (select private.current_club_id())
        and private.current_club_role(club_id) = 'admin'::public.user_role)
  );

-- 3. btree_gist belongs in the extensions schema. Existing constraints keep working.
alter extension btree_gist set schema extensions;

-- 4. Covering indexes for foreign keys.
create index if not exists bookings_club_court_venue_idx on public.bookings (club_id, court_id, venue_id);
create index if not exists bookings_club_member_idx on public.bookings (club_id, member_id);
create index if not exists bookings_session_club_venue_idx on public.bookings (session_id, club_id, venue_id);
create index if not exists checkins_member_club_idx on public.checkins (member_id, club_id);
create index if not exists checkins_staff_idx on public.checkins (staff_id);
create index if not exists club_staff_roles_user_idx on public.club_staff_roles (user_id);
create index if not exists court_allocations_club_venue_court_idx on public.court_allocations (club_id, venue_id, court_id);
create index if not exists court_allocations_court_club_idx on public.court_allocations (court_id, club_id);
create index if not exists court_allocations_venue_idx on public.court_allocations (venue_id);
create index if not exists court_allocations_created_by_idx on public.court_allocations (created_by);
create index if not exists court_sessions_booking_club_venue_idx on public.court_sessions (booking_id, club_id, venue_id);
create index if not exists court_sessions_court_club_venue_idx on public.court_sessions (court_id, club_id, venue_id);
create index if not exists court_sessions_member_club_idx on public.court_sessions (member_id, club_id);
create index if not exists court_sessions_created_by_idx on public.court_sessions (created_by);
create index if not exists members_user_idx on public.members (user_id);
create index if not exists notifications_club_venue_idx on public.notifications (club_id, venue_id);
create index if not exists notifications_user_club_idx on public.notifications (user_id, club_id);
create index if not exists open_play_signups_club_venue_play_idx on public.open_play_signups (club_id, venue_id, open_play_id);
create index if not exists open_play_signups_play_club_idx on public.open_play_signups (open_play_id, club_id);
create index if not exists open_play_signups_member_club_idx on public.open_play_signups (member_id, club_id);
create index if not exists open_plays_court_club_venue_idx on public.open_plays (court_id, club_id, venue_id);
create index if not exists open_plays_created_by_idx on public.open_plays (created_by);
create index if not exists platform_audit_log_actor_idx on public.platform_audit_log (actor_id);
create index if not exists platform_commissions_club_venue_idx on public.platform_commissions (club_id, venue_id);
create index if not exists platform_support_sessions_club_idx on public.platform_support_sessions (club_id);
create index if not exists reminders_booking_club_idx on public.reminders (booking_id, club_id);
create index if not exists reminders_play_club_idx on public.reminders (open_play_id, club_id);
create index if not exists reminders_club_venue_idx on public.reminders (club_id, venue_id);
create index if not exists reminders_user_club_idx on public.reminders (user_id, club_id);
create index if not exists staff_venue_grants_club_venue_idx on public.staff_venue_grants (club_id, venue_id);
create index if not exists staff_venue_grants_granted_by_idx on public.staff_venue_grants (granted_by);
create index if not exists support_inquiries_club_idx on public.support_inquiries (club_id);
create index if not exists support_inquiries_responded_by_idx on public.support_inquiries (responded_by);
create index if not exists support_inquiries_user_idx on public.support_inquiries (user_id);
create index if not exists transactions_member_club_idx on public.transactions (member_id, club_id);
create index if not exists transactions_created_by_idx on public.transactions (created_by);
create index if not exists walkins_club_venue_idx on public.walkins (club_id, venue_id);
create index if not exists walkins_created_by_idx on public.walkins (created_by);

-- 5. Reachable only through audited functions, which run as the table owner.
create policy no_direct_api_access on public.platform_roles
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy no_direct_api_access on public.platform_audit_log
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy no_direct_api_access on public.platform_support_sessions
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy no_direct_api_access on private.auth_rate_limit_events
  as restrictive for all to anon, authenticated using (false) with check (false);

-- 6. Signed-in views: the same rows and columns, now behind private definer functions.
create function private.member_admin_rows()
returns table (id uuid, user_id uuid, member_code text, full_name text, email text, phone text,
  membership_type public.membership_type, status public.member_status, join_date date, expiry_date date,
  notes text, created_at timestamptz, qr_token text, club_id uuid)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.user_id, m.member_code, m.full_name, m.email, m.phone, m.membership_type, m.status,
         m.join_date, m.expiry_date, m.notes, m.created_at, m.qr_token, m.club_id
  from public.members m
  where m.club_id = private.current_club_id()
    and private.current_club_role(m.club_id) = 'admin'::public.user_role
$$;

create function private.member_roster_rows()
returns table (club_id uuid, id uuid, member_code text, full_name text,
  membership_type public.membership_type, status public.member_status, expiry_date date, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.club_id, m.id, m.member_code, m.full_name, m.membership_type, m.status, m.expiry_date, m.created_at
  from public.members m
  where m.club_id = private.current_club_id()
    and private.current_club_role(m.club_id) = any (array['staff', 'admin']::public.user_role[])
$$;

create function private.member_self_rows()
returns table (id uuid, user_id uuid, member_code text, full_name text, email text, phone text,
  membership_type public.membership_type, status public.member_status, join_date date, expiry_date date,
  notes text, created_at timestamptz, qr_token text, club_id uuid)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.user_id, m.member_code, m.full_name, m.email, m.phone, m.membership_type, m.status,
         m.join_date, m.expiry_date, m.notes, m.created_at, m.qr_token, m.club_id
  from public.members m
  where m.club_id = private.current_club_id()
    and m.user_id = auth.uid()
$$;

create function private.open_play_seat_counts_rows()
returns table (club_id uuid, venue_id uuid, open_play_id uuid, seats_taken integer)
language sql stable security definer set search_path = ''
as $$
  select o.club_id, o.venue_id, o.id,
         (select count(*)::integer
          from public.open_play_signups s
          where s.club_id = o.club_id and s.venue_id = o.venue_id and s.open_play_id = o.id
            and s.status = 'joined'::public.open_play_signup_status)
  from public.open_plays o
  where o.club_id = private.current_club_id()
    and private.can_access_venue(o.club_id, o.venue_id)
$$;

create function private.staff_accounts_rows()
returns table (club_id uuid, user_id uuid, email text, full_name text, phone text,
  role public.user_role, venue_ids uuid[])
language sql stable security definer set search_path = ''
as $$
  select csr.club_id, p.id, p.email, p.full_name, p.phone, csr.role,
         coalesce(array_agg(g.venue_id) filter (where g.is_active), '{}'::uuid[])
  from public.club_staff_roles csr
  join public.profiles p on p.id = csr.user_id
  left join public.staff_venue_grants g on g.club_id = csr.club_id and g.user_id = csr.user_id
  where csr.club_id = private.current_club_id()
    and csr.is_active
    and private.current_club_role(csr.club_id) = 'admin'::public.user_role
  group by csr.club_id, p.id, p.email, p.full_name, p.phone, csr.role
$$;

revoke all on function private.member_admin_rows(), private.member_roster_rows(), private.member_self_rows(),
  private.open_play_seat_counts_rows(), private.staff_accounts_rows() from public, anon, authenticated, service_role;
grant execute on function private.member_admin_rows(), private.member_roster_rows(), private.member_self_rows(),
  private.open_play_seat_counts_rows(), private.staff_accounts_rows() to authenticated;

-- CREATE OR REPLACE keeps each view's existing grants (authenticated SELECT only).
create or replace view public.member_admin with (security_barrier = true, security_invoker = true)
  as select * from private.member_admin_rows();
create or replace view public.member_roster with (security_barrier = true, security_invoker = true)
  as select * from private.member_roster_rows();
create or replace view public.member_self with (security_barrier = true, security_invoker = true)
  as select * from private.member_self_rows();
create or replace view public.open_play_seat_counts with (security_barrier = true, security_invoker = true)
  as select * from private.open_play_seat_counts_rows();
create or replace view public.staff_accounts with (security_barrier = true, security_invoker = true)
  as select * from private.staff_accounts_rows();
