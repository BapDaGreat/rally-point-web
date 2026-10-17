-- Supabase advisor follow-up postflight. Read-only: catalog and ledger lookups only.
-- Run against the target after 20261017170000_supabase_advisor_followup.sql.
-- Every row with required = true must have ok = true.
with uncovered as (
  -- The advisor's rule: an index whose leading columns are the key's columns, in order.
  select c.conname
  from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid
        and (string_to_array(i.indkey::text, ' ')::smallint[])[1:cardinality(c.conkey)] = c.conkey)
), board as (
  select to_regnamespace('board') as schema_oid, to_regprocedure('board.public_schedule_rows()') as function_oid
), backed(view_name, schema_name, signature) as (
  -- Each security-invoker view and the definer function it reads.
  values
    ('public.public_schedule', 'board', 'board.public_schedule_rows()'),
    ('public.member_admin', 'private', 'private.member_admin_rows()'),
    ('public.member_roster', 'private', 'private.member_roster_rows()'),
    ('public.member_self', 'private', 'private.member_self_rows()'),
    ('public.open_play_seat_counts', 'private', 'private.open_play_seat_counts_rows()'),
    ('public.staff_accounts', 'private', 'private.staff_accounts_rows()')
), stranded as (
  -- A role that may read a view but could not run its function would be refused.
  select b.view_name, r.role
  from backed b, (values ('anon'), ('authenticated'), ('service_role')) r(role)
  where has_table_privilege(r.role, b.view_name, 'SELECT')
    and (to_regprocedure(b.signature) is null
         or not has_schema_privilege(r.role, to_regnamespace(b.schema_name), 'USAGE')
         or not has_function_privilege(r.role, to_regprocedure(b.signature), 'EXECUTE'))
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
  select 1, 'ledger_has_followup', true,
         exists (select 1 from supabase_migrations.schema_migrations where version = '20261017170000')
         and (select count(*) from supabase_migrations.schema_migrations) = 23,
         (select count(*)::text from supabase_migrations.schema_migrations) || ' versions recorded'
  union all
  select 2, 'foreign_keys_indexed_in_order', true,
         not exists (select 1 from uncovered),
         (select count(*)::text from uncovered) || ' foreign keys without an index in their column order'
  union all
  select 3, 'no_definer_views', true,
         not exists (select 1 from pg_class c
                     where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
                       and not ('security_invoker=true' = any(coalesce(c.reloptions, '{}')))),
         'every public view runs with the caller''s rights'
  union all
  select 4, 'schedule_board_reads_board_function', true,
         exists (select 1 from board b join pg_proc p on p.oid = b.function_oid
                 where p.prosecdef and p.proconfig @> array['search_path=""'])
         and pg_get_viewdef('public.public_schedule'::regclass) like '%board.public_schedule_rows()%',
         'public_schedule reads board.public_schedule_rows(), a definer function with an empty search path'
  union all
  select 5, 'schedule_board_open_to_boards', true,
         case when (select function_oid from board) is null then false
              else has_table_privilege('anon', 'public.public_schedule', 'SELECT')
                   and has_table_privilege('authenticated', 'public.public_schedule', 'SELECT')
                   and has_schema_privilege('anon', 'board', 'USAGE')
                   and has_schema_privilege('authenticated', 'board', 'USAGE')
                   and has_function_privilege('anon', 'board.public_schedule_rows()', 'EXECUTE')
                   and has_function_privilege('authenticated', 'board.public_schedule_rows()', 'EXECUTE') end,
         'anonymous TV boards and signed-in users can still read the schedule'
  union all
  select 6, 'board_schema_holds_only_the_schedule', true,
         case when (select function_oid from board) is null then false
              else (select count(*) from pg_proc where pronamespace = (select schema_oid from board)) = 1
                   and not exists (select 1 from pg_class where relnamespace = (select schema_oid from board))
                   and not has_function_privilege('public', 'board.public_schedule_rows()', 'EXECUTE') end,
         'one function, and PUBLIC cannot run it'
  union all
  select 7, 'view_readers_can_run_view_functions', true,
         not exists (select 1 from stranded),
         coalesce((select string_agg(role || ' on ' || view_name, ', ') from stranded), 'no role')
           || ' would be refused by a view it may read'
  union all
  select 8, 'private_schema_closed_to_anon', true,
         not has_schema_privilege('anon', 'private', 'USAGE'),
         'anonymous callers still cannot reach the private schema'
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
