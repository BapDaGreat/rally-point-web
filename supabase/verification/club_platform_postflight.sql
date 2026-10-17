-- Club platform release postflight. Read-only: catalog and ledger lookups only.
-- Run against the target after the package; it names package tables directly,
-- so on an unmigrated target it stops with an error instead of returning rows.
-- Every row with required = true must have ok = true; the rest are information.
with expected(version) as (
  values ('001'), ('002'), ('003'), ('004'), ('20260803125450'), ('20260805094557'),
         ('20260921090000'), ('20260921110828'), ('20260921111105'), ('20260922011918'),
         ('20260922163027'), ('20260922163830'), ('20260922164128'), ('20260923053440'),
         ('20260925174111'), ('20260927105500'), ('20260928170000'), ('20261017090000'),
         ('20261017090100'), ('20261017090200'), ('20261017090300')
), ledger as (
  select array_agg(version order by version) as versions from supabase_migrations.schema_migrations
), api_roles(role) as (
  values ('anon'), ('authenticated')
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
), platform_tables(name, client_readable) as (
  values ('public.platform_roles', false), ('public.platform_audit_log', false),
         ('public.platform_support_sessions', false), ('public.club_accounts', true),
         ('public.platform_commissions', true)
), present_tables as (
  select t.name, t.client_readable, c.relrowsecurity
  from platform_tables t join pg_class c on c.oid = to_regclass(t.name)
), signed_in_functions(signature) as (
  values
    ('public.get_platform_access()'), ('public.platform_list_clubs()'),
    ('public.platform_commission_ledger(uuid, integer)'),
    ('public.platform_provision_club(text, text, text, text, text, text, numeric, integer)'),
    ('public.platform_set_club_status(uuid, text)'), ('public.platform_set_commission_rate(uuid, numeric)'),
    ('public.platform_assign_club_admin(uuid, text)'), ('public.platform_revoke_club_admin(uuid, uuid)'),
    ('public.platform_recent_actions(integer)'), ('public.platform_club_admins(uuid)'),
    ('public.platform_start_support_session(uuid, text, integer)'), ('public.platform_end_support_session(uuid)'),
    ('public.platform_my_support_sessions()'), ('public.platform_support_snapshot(uuid)'),
    ('public.list_my_clubs()'), ('public.join_club(text)')
), private_helpers(signature) as (
  values ('private.is_platform_superadmin()'), ('private.require_platform_superadmin()'),
         ('private.platform_audit(text, uuid, jsonb)'), ('private.open_support_session(uuid)')
), checks(sort, check_name, required, ok, detail) as (
  select 1, 'ledger_has_every_migration', true,
         coalesce((select versions from ledger) = (select array_agg(version order by version) from expected), false),
         coalesce((select array_length(versions, 1)::text from ledger), '0') || ' versions recorded'
  union all
  select 2, 'tenant_enforcement_applied', true,
         exists (select 1 from pg_constraint where conrelid = 'public.members'::regclass and conname = 'members_club_user_key')
         and not exists (select 1 from pg_constraint where conrelid = 'public.members'::regclass and conname = 'members_user_id_key'),
         'members_club_user_key present and members_user_id_key absent'
  union all
  select 3, 'reservation_writes_still_paused', true,
         not exists (select 1 from paused p, api_roles r where has_function_privilege(r.role, p.signature, 'EXECUTE')),
         (select count(*)::text from paused) || ' booking functions checked for anon and authenticated'
  union all
  select 4, 'platform_tables_have_row_security', true,
         (select count(*) from present_tables where relrowsecurity) = (select count(*) from platform_tables),
         (select count(*)::text from present_tables) || ' of ' || (select count(*)::text from platform_tables) || ' tables present'
  union all
  select 5, 'platform_tables_closed_to_client_writes', true,
         not exists (select 1 from present_tables t, api_roles r
                     where has_table_privilege(r.role, t.name, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')),
         'no insert, update, delete, truncate, references or trigger for anon or authenticated'
  union all
  select 6, 'private_platform_tables_unreadable', true,
         not exists (select 1 from present_tables t, api_roles r
                     where not t.client_readable and has_table_privilege(r.role, t.name, 'SELECT')),
         'platform roles, audit log and support sessions have no API read access'
  union all
  select 7, 'club_terms_signed_in_read_only', true,
         not exists (select 1 from present_tables t
                     where t.client_readable
                       and (not has_table_privilege('authenticated', t.name, 'SELECT')
                            or has_table_privilege('anon', t.name, 'SELECT'))),
         'club accounts and commissions readable by signed-in users only (row security decides which rows)'
  union all
  select 8, 'platform_functions_signed_in_only', true,
         (select count(*) from signed_in_functions where to_regprocedure(signature) is not null)
           = (select count(*) from signed_in_functions)
         and not exists (select 1 from signed_in_functions f
                         where to_regprocedure(f.signature) is not null
                           and (not has_function_privilege('authenticated', f.signature, 'EXECUTE')
                                or has_function_privilege('anon', f.signature, 'EXECUTE'))),
         (select count(*)::text from signed_in_functions) || ' functions: authenticated yes, anon no'
  union all
  select 9, 'private_platform_helpers_hidden', true,
         (select count(*) from private_helpers where to_regprocedure(signature) is not null)
           = (select count(*) from private_helpers)
         and not exists (select 1 from private_helpers h, api_roles r
                         where to_regprocedure(h.signature) is not null
                           and has_function_privilege(r.role, h.signature, 'EXECUTE')),
         'no API role may call the private platform helpers'
  union all
  select 10, 'public_club_lookup_open', true,
         to_regprocedure('public.get_public_club(text)') is not null
         and has_function_privilege('anon', 'public.get_public_club(text)', 'EXECUTE'),
         'join links and TV boards look clubs up anonymously'
  union all
  select 11, 'club_context_open_to_boards', true,
         has_function_privilege('anon', 'private.current_club_id()', 'EXECUTE'),
         'anonymous schedule reads depend on current_club_id'
  union all
  select 12, 'every_club_has_an_account', true,
         not exists (select 1 from public.clubs c
                     where not exists (select 1 from public.club_accounts a where a.club_id = c.id)),
         (select count(*)::text from public.clubs) || ' clubs'
  union all
  select 13, 'commission_triggers_enabled', true,
         (select count(*) from pg_trigger
          where tgrelid = 'public.transactions'::regclass and not tgisinternal and tgenabled <> 'D'
            and tgname in ('transactions_record_platform_commission', 'transactions_sync_platform_commission')) = 2,
         'record and sync triggers on transactions'
  union all
  select 14, 'support_inquiries_present', true,
         to_regclass('public.support_inquiries') is not null,
         coalesce(to_regclass('public.support_inquiries')::text, 'absent')
  union all
  select 15, 'default_club_active', true,
         exists (select 1 from public.clubs
                 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and slug = 'rally-point-gensan' and is_active),
         'Rally Point Gensan'
  union all
  select 16, 'platform_superadmins', false, true,
         (select count(*)::text from public.platform_roles) || ' platform accounts'
  union all
  select 17, 'club_count', false, true,
         (select count(*)::text || ' clubs, ' || (count(*) filter (where is_active))::text || ' active' from public.clubs)
)
select check_name, required, ok, detail from checks order by sort;
