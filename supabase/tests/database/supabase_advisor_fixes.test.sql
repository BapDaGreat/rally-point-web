begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select extensions.plan(16);

-- Structure: what the Supabase advisor checks.
select extensions.is(
  (select count(*)::int from (
     with fk as (
       select c.conrelid, c.conname, array_agg(k.attnum order by k.ord) as nums
       from pg_constraint c cross join lateral unnest(c.conkey) with ordinality k(attnum, ord)
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
       group by c.conrelid, c.conname)
     select fk.conname from fk
     where not exists (
       select 1 from pg_index i where i.indrelid = fk.conrelid
         and (select array_agg(x order by x) from unnest((i.indkey::int2[])[0:cardinality(fk.nums) - 1]) x)
           = (select array_agg(y order by y) from unnest(fk.nums) y))) t),
  0, 'every foreign key has a covering index');
select extensions.is(
  (select n.nspname::text from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'btree_gist'),
  'extensions', 'btree_gist lives in the extensions schema');
select extensions.is(
  (select count(*)::int from pg_policies
   where (coalesce(qual, '') || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
     and (coalesce(qual, '') || coalesce(with_check, '')) !~ 'SELECT auth\.uid\(\)'),
  0, 'no policy re-evaluates auth.uid() for every row');
select extensions.is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'venues' and cmd = 'SELECT' and permissive = 'PERMISSIVE' and 'authenticated' = any(roles)),
  1, 'venues has one SELECT policy for signed-in users');
select extensions.is(
  (select count(*)::int from pg_class c
   where c.relkind = 'r' and c.relrowsecurity and c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  0, 'no table has row security without a policy');
select extensions.ok(
  (select bool_and('security_invoker=true' = any(coalesce(c.reloptions, '{}'))) from pg_class c
   where c.oid in ('public.member_admin'::regclass, 'public.member_roster'::regclass, 'public.member_self'::regclass,
                   'public.open_play_seat_counts'::regclass, 'public.staff_accounts'::regclass)),
  'the five signed-in views run with the caller''s rights');
select extensions.ok(
  (select bool_and(p.prosecdef) from pg_proc p
   where p.pronamespace = 'private'::regnamespace
     and p.proname in ('member_admin_rows', 'member_roster_rows', 'member_self_rows', 'open_play_seat_counts_rows', 'staff_accounts_rows')),
  'the five view functions are security definer');

-- Privileges: nobody gains access.
select extensions.ok(
  (select bool_and(has_function_privilege('authenticated', f, 'EXECUTE') and not has_function_privilege('anon', f, 'EXECUTE'))
   from unnest(array['private.member_admin_rows()', 'private.member_roster_rows()', 'private.member_self_rows()',
                     'private.open_play_seat_counts_rows()', 'private.staff_accounts_rows()']) f),
  'the view functions are for signed-in users only');
select extensions.ok(
  not exists (select 1
              from unnest(array['public.member_admin', 'public.member_roster', 'public.member_self',
                                'public.open_play_seat_counts', 'public.staff_accounts']) v
              where has_table_privilege('anon', v, 'SELECT')),
  'anonymous visitors still cannot read the signed-in views');
select extensions.ok(
  not exists (select 1
              from unnest(array['public.platform_roles', 'public.platform_audit_log', 'public.platform_support_sessions']) t,
                   (values ('anon'), ('authenticated')) r(role)
              where has_table_privilege(r.role, t, 'SELECT, INSERT, UPDATE, DELETE')),
  'platform tables still have no API privileges');

-- Behaviour: the merged venues policy and the view functions answer exactly as before.
insert into auth.users (id, email, raw_user_meta_data)
select ('ad000000-0000-4000-8000-00000000000' || n)::uuid, 'advisor-' || n || '@fixture.invalid',
       jsonb_build_object('full_name', 'Advisor User ' || n)
from generate_series(1, 3) n;
insert into public.venues (id, club_id, slug, name) values
  ('ad300000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'advisor-a1', 'Advisor A1'),
  ('ad300000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'advisor-a2', 'Advisor A2');
insert into public.club_staff_roles (club_id, user_id, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ad000000-0000-4000-8000-000000000001', 'admin'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ad000000-0000-4000-8000-000000000002', 'staff');
insert into public.staff_venue_grants (club_id, user_id, venue_id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ad000000-0000-4000-8000-000000000002', 'ad300000-0000-4000-8000-000000000001');

create function pg_temp.old_venue_rule_count() returns integer language sql as $$
  select count(*)::int from public.venues v
  where private.can_access_venue(v.club_id, v.id)
     or (v.club_id = private.current_club_id() and private.current_club_role(v.club_id) = 'admin'::public.user_role)
$$;

select set_config('request.headers', '', true);
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);
select set_config('test.expected', pg_temp.old_venue_rule_count()::text, true);
set local role authenticated;
select extensions.is((select count(*)::int from public.venues), current_setting('test.expected')::int,
  'an admin sees exactly the venues the two old policies allowed');
select extensions.is((select count(*)::int from public.member_admin), (select count(*)::int from private.member_admin_rows()),
  'the admin member list matches its function');

set local role postgres;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000002', true);
select set_config('test.expected', pg_temp.old_venue_rule_count()::text, true);
set local role authenticated;
select extensions.is((select count(*)::int from public.venues), current_setting('test.expected')::int,
  'staff see exactly the venues the two old policies allowed');
select extensions.is((select count(*)::int from public.member_admin), 0, 'staff still get no admin member list');

set local role postgres;
select set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000003', true);
select set_config('test.expected', pg_temp.old_venue_rule_count()::text, true);
set local role authenticated;
select extensions.is((select count(*)::int from public.venues), current_setting('test.expected')::int,
  'members see exactly the venues the two old policies allowed');
select extensions.is((select count(*)::int from public.member_self), 1, 'a member still sees their own membership');

select * from extensions.finish();
rollback;
