-- Batch 1: make profile roles and signup provisioning server-authoritative.
-- Prepared for local and staging verification only.
-- Requires migrations 001-004 in order; never apply directly to the legacy live schema.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles as p
  where p.id = (select auth.uid());
$$;

revoke all on function private.current_role() from public;
revoke all on function private.current_role() from anon;
revoke all on function private.current_role() from authenticated;
grant execute on function private.current_role() to authenticated;

comment on function private.current_role() is
  'Returns the authenticated caller role for RLS evaluation. Not exposed through the Data API.';

do $$
begin
  if exists (
    select 1
    from public.members
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one member per profile: duplicate members.user_id values exist';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.members'::regclass
      and conname = 'members_user_id_key'
  ) then
    alter table public.members
      add constraint members_user_id_key unique (user_id);
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_code text;
  v_token text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');
  v_code := 'RP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := 'q_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24);

  insert into public.profiles (id, email, full_name, role, phone)
  values (new.id, new.email, v_name, 'member', v_phone)
  on conflict (id) do nothing;

  insert into public.members (
    user_id, member_code, full_name, email, phone,
    membership_type, status, join_date, expiry_date, qr_token
  )
  values (
    new.id, v_code, v_name, new.email, v_phone,
    'standard', 'active', current_date, current_date + 30, v_token
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

comment on function public.handle_new_user() is
  'Auth trigger only. Creates an atomic member profile and ignores authorization metadata.';

alter policy profiles_select_own_or_staff
  on public.profiles
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.current_role()) in ('staff', 'admin')
  );

alter policy profiles_update_own_or_admin
  on public.profiles
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.current_role()) = 'admin'
  )
  with check (
    (select private.current_role()) = 'admin'
    or (
      id = (select auth.uid())
      and role = (select private.current_role())
    )
  );

alter policy members_select
  on public.members
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.current_role()) in ('staff', 'admin')
  );

alter policy members_write_staff
  on public.members
  to authenticated
  using ((select private.current_role()) in ('staff', 'admin'))
  with check ((select private.current_role()) in ('staff', 'admin'));

alter policy members_insert_own
  on public.members
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.current_role()) = 'member'
  );

alter policy members_update_own
  on public.members
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy courts_write_staff
  on public.courts
  to authenticated
  using ((select private.current_role()) in ('staff', 'admin'))
  with check ((select private.current_role()) in ('staff', 'admin'));

alter policy sessions_read
  on public.court_sessions
  to authenticated
  using (
    (select private.current_role()) in ('staff', 'admin')
    or member_id in (
      select m.id
      from public.members as m
      where m.user_id = (select auth.uid())
    )
  );

alter policy sessions_write_staff
  on public.court_sessions
  to authenticated
  using ((select private.current_role()) in ('staff', 'admin'))
  with check ((select private.current_role()) in ('staff', 'admin'));

alter policy checkins_read
  on public.checkins
  to authenticated
  using (
    (select private.current_role()) in ('staff', 'admin')
    or member_id in (
      select m.id
      from public.members as m
      where m.user_id = (select auth.uid())
    )
  );

alter policy checkins_write_staff
  on public.checkins
  to authenticated
  using ((select private.current_role()) in ('staff', 'admin'))
  with check ((select private.current_role()) in ('staff', 'admin'));

alter policy tx_read
  on public.transactions
  to authenticated
  using (
    (select private.current_role()) in ('staff', 'admin')
    or member_id in (
      select m.id
      from public.members as m
      where m.user_id = (select auth.uid())
    )
  );

alter policy tx_write
  on public.transactions
  to authenticated
  with check ((select private.current_role()) in ('staff', 'admin', 'member'));

alter policy notif_own
  on public.notifications
  to authenticated
  using (user_id = (select auth.uid()));

alter policy notif_update_own
  on public.notifications
  to authenticated
  using (user_id = (select auth.uid()));

alter policy notif_insert_staff
  on public.notifications
  to authenticated
  with check ((select private.current_role()) in ('staff', 'admin', 'member'));

alter policy walkins_staff
  on public.walkins
  to authenticated
  using ((select private.current_role()) in ('staff', 'admin'))
  with check ((select private.current_role()) in ('staff', 'admin'));

alter policy bookings_select_own_or_staff on public.bookings to authenticated;
alter policy bookings_insert_own on public.bookings to authenticated;
alter policy bookings_update_own_or_staff on public.bookings to authenticated;
alter policy open_plays_write_staff on public.open_plays to authenticated;
alter policy open_play_signups_read on public.open_play_signups to authenticated;
alter policy open_play_signups_insert on public.open_play_signups to authenticated;
alter policy open_play_signups_update on public.open_play_signups to authenticated;
alter policy reminders_own on public.reminders to authenticated;

drop function public.current_role();

-- Explicit Data API grants. New Supabase projects no longer auto-expose tables.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.members to authenticated;
grant select, insert, update on public.courts to authenticated;
grant select, insert, update on public.court_sessions to authenticated;
grant select, insert on public.checkins to authenticated;
grant select, insert on public.transactions to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, insert on public.walkins to authenticated;
grant select, insert, update on public.bookings to authenticated;
grant select, insert, update on public.open_plays to authenticated;
grant select, insert, update on public.open_play_signups to authenticated;
grant select on public.reminders to authenticated;
