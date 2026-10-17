-- Club platform release preflight. Read-only: catalog and ledger lookups only.
-- Run against the target before applying the package. Every row with
-- required = true must have ok = true; the other rows are information.
with expected(version) as (
  values ('001'), ('002'), ('003'), ('004'), ('20260803125450'), ('20260805094557'),
         ('20260921090000'), ('20260921110828'), ('20260922011918'), ('20260922163027'),
         ('20260922163830'), ('20260922164128'), ('20260923053440'), ('20260925174111')
), ledger as (
  select array_agg(version order by version) as versions from supabase_migrations.schema_migrations
), paused(signature) as (
  values
    ('public.create_unpaid_desk_booking(uuid, uuid, uuid, uuid, date, integer, integer)'),
    ('public.create_desk_rental(uuid, uuid, uuid, uuid, text, integer)'),
    ('public.add_member_to_session(uuid, uuid)'),
    ('public.extend_desk_session(uuid, integer)'),
    ('public.end_desk_session(uuid)'),
    ('public.create_open_play_session(uuid, uuid, uuid, text, timestamptz, timestamptz, integer, numeric, public.skill_level, text)'),
    ('public.join_open_play_session(uuid, uuid)'),
    ('public.leave_open_play_session(uuid, uuid)'),
    ('public.cancel_booking_reservation(uuid)')
), checks(sort, check_name, required, ok, detail) as (
  select 1, 'ledger_is_staging_baseline', true,
         coalesce((select versions from ledger) = (select array_agg(version order by version) from expected), false),
         coalesce((select array_to_string(versions, ',') from ledger), '(empty)')
  union all
  select 2, 'tenant_enforcement_not_applied', true,
         exists (select 1 from pg_constraint where conrelid = 'public.members'::regclass and conname = 'members_user_id_key')
         and not exists (select 1 from pg_constraint where conrelid = 'public.members'::regclass and conname = 'members_club_user_key'),
         'members_user_id_key present and members_club_user_key absent'
  union all
  select 3, 'reservation_writes_paused', true,
         not exists (select 1 from paused p, (values ('anon'), ('authenticated')) r(role)
                     where has_function_privilege(r.role, p.signature, 'EXECUTE')),
         (select count(*)::text from paused) || ' booking functions checked for anon and authenticated'
  union all
  select 4, 'support_inquiries_not_applied', true,
         to_regclass('public.support_inquiries') is null,
         coalesce(to_regclass('public.support_inquiries')::text, 'absent')
  union all
  select 5, 'club_platform_not_applied', true,
         to_regclass('public.platform_roles') is null and to_regclass('public.club_accounts') is null
         and to_regclass('public.platform_commissions') is null and to_regclass('public.platform_support_sessions') is null,
         'platform tables absent'
  union all
  select 6, 'default_club_active', true,
         exists (select 1 from public.clubs
                 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and slug = 'rally-point-gensan' and is_active),
         'Rally Point Gensan'
  union all
  select 7, 'auth_users_readable', true,
         has_table_privilege('auth.users', 'SELECT')
         and (select count(*) from information_schema.columns
              where table_schema = 'auth' and table_name = 'users'
                and column_name in ('email', 'deleted_at', 'is_sso_user')) = 3,
         'platform_assign_club_admin reads email, deleted_at and is_sso_user'
  union all
  select 8, 'no_leftover_isolation_fixture', true,
         not exists (select 1 from public.clubs where slug = 'two-club-isolation-b')
         and not exists (select 1 from auth.users where email like 'two-club-%@fixture.invalid'),
         'two_club_isolation.sql must start clean'
  union all
  select 9, 'auth_users_insertable', false,
         has_table_privilege('auth.users', 'INSERT'),
         'decides whether two_club_isolation.sql can run in one rolled-back transaction here'
  union all
  select 10, 'pgtap_available', false,
         exists (select 1 from pg_available_extensions where name = 'pgtap'),
         coalesce((select default_version from pg_available_extensions where name = 'pgtap'), 'not available')
  union all
  select 11, 'club_count', false, true,
         (select count(*)::text || ' clubs, ' || (count(*) filter (where is_active))::text || ' active' from public.clubs)
)
select check_name, required, ok, detail from checks order by sort;
