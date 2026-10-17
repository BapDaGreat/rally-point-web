-- Supabase advisor fixes postflight. Read-only: catalog and ledger lookups only.
-- Run against the target after 20261017160000_supabase_advisor_fixes.sql.
-- Every row with required = true must have ok = true.
with fk as (
  select c.conrelid, c.conname, array_agg(k.attnum order by k.ord) as nums
  from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  group by c.conrelid, c.conname
), unindexed as (
  select fk.conname from fk
  where not exists (
    select 1 from pg_index i where i.indrelid = fk.conrelid
      and (select array_agg(x order by x) from unnest((i.indkey::int2[])[0:cardinality(fk.nums) - 1]) x)
        = (select array_agg(y order by y) from unnest(fk.nums) y))
), view_functions(signature) as (
  values ('private.member_admin_rows()'), ('private.member_roster_rows()'), ('private.member_self_rows()'),
         ('private.open_play_seat_counts_rows()'), ('private.staff_accounts_rows()')
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
  select 1, 'ledger_has_advisor_fix', true,
         exists (select 1 from supabase_migrations.schema_migrations where version = '20261017160000')
         and (select count(*) from supabase_migrations.schema_migrations) = 22,
         (select count(*)::text from supabase_migrations.schema_migrations) || ' versions recorded'
  union all
  select 2, 'foreign_keys_indexed', true,
         not exists (select 1 from unindexed),
         (select count(*)::text from unindexed) || ' foreign keys without a covering index'
  union all
  select 3, 'btree_gist_outside_public', true,
         exists (select 1 from pg_extension e where e.extname = 'btree_gist' and e.extnamespace = 'extensions'::regnamespace),
         'btree_gist belongs in the extensions schema'
  union all
  select 4, 'policies_read_caller_once', true,
         not exists (select 1 from pg_policies
                     where (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
                       and (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT auth\.uid\(\)'),
         'no policy re-evaluates auth.uid() for every row'
  union all
  select 5, 'venues_single_select_policy', true,
         (select count(*) from pg_policies
          where schemaname = 'public' and tablename = 'venues' and cmd = 'SELECT'
            and permissive = 'PERMISSIVE' and 'authenticated' = any(roles)) = 1,
         'one SELECT policy for signed-in users'
  union all
  select 6, 'row_security_tables_have_policies', true,
         not exists (select 1 from pg_class c
                     where c.relkind = 'r' and c.relrowsecurity
                       and c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
                       and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
         'every table with row security has a policy'
  union all
  select 7, 'only_schedule_board_is_definer_view', true,
         (select coalesce(string_agg(c.relname::text, ',' order by c.relname), '') from pg_class c
          where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
            and not ('security_invoker=true' = any(coalesce(c.reloptions, '{}')))) = 'public_schedule',
         'public_schedule stays a definer view for anonymous boards'
  union all
  select 8, 'view_functions_signed_in_only', true,
         (select count(*) from view_functions where to_regprocedure(signature) is not null) = 5
         and not exists (select 1 from view_functions f
                         where to_regprocedure(f.signature) is not null
                           and (not has_function_privilege('authenticated', f.signature, 'EXECUTE')
                                or has_function_privilege('anon', f.signature, 'EXECUTE'))),
         'five private view functions: authenticated yes, anon no'
  union all
  select 9, 'reservation_writes_still_paused', true,
         not exists (select 1 from paused p, (values ('anon'), ('authenticated')) r(role)
                     where has_function_privilege(r.role, p.signature, 'EXECUTE')),
         (select count(*)::text from paused) || ' booking functions checked for anon and authenticated'
  union all
  select 10, 'platform_tables_closed', true,
         not exists (select 1
                     from (values ('public.platform_roles'), ('public.platform_audit_log'), ('public.platform_support_sessions')) t(name),
                          (values ('anon'), ('authenticated')) r(role)
                     where has_table_privilege(r.role, t.name, 'SELECT, INSERT, UPDATE, DELETE')),
         'no API privileges on platform tables'
)
select check_name, required, ok, detail from checks order by sort;
