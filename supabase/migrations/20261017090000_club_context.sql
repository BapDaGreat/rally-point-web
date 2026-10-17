-- Multi-club context: the active club comes from the request, not a constant.
--
-- PostgREST exposes request headers to SQL as request.headers (JSON with
-- lowercased keys). The app sends x-club-id on database requests:
--   * no x-club-id key -> Rally Point Gensan, the single-club behaviour every
--     earlier migration, suite and verifier was written against;
--   * key present      -> that club when it is active, otherwise NULL.
-- NULL fails closed wherever a row's club is compared with current_club_id().
-- The header only chooses context: access still needs current_club_role(club),
-- which reads trusted club_staff_roles and members rows.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass and conname = 'members_club_user_key'
  ) then
    raise exception 'Multi-club context needs tenant enforcement first (members_club_user_key is missing).';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass and conname = 'members_user_id_key'
  ) then
    raise exception 'Multi-club context needs tenant enforcement first (members_user_id_key still exists).';
  end if;
  if has_table_privilege('authenticated', 'public.transactions', 'INSERT')
     or has_table_privilege('anon', 'public.transactions', 'INSERT') then
    raise exception 'Multi-club context needs direct transaction writes to stay revoked.';
  end if;
end;
$$;

-- CREATE OR REPLACE keeps the existing owner and grants. Anonymous public
-- schedule reads rely on the PUBLIC execute grant, so it is never revoked here.
create or replace function private.current_club_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  with request as (
    select nullif(current_setting('request.headers', true), '')::jsonb as headers
  )
  select case
    when coalesce((select headers ? 'x-club-id' from request), false) then (
      select c.id
      from public.clubs c
      where c.is_active
        and c.id::text = lower(btrim((select headers ->> 'x-club-id' from request)))
    )
    else (
      select c.id
      from public.clubs c
      where c.slug = 'rally-point-gensan' and c.is_active
      limit 1
    )
  end;
$$;

-- Check the caller's access before looking up the code, so the error message
-- never reveals whether a member code exists in a club the caller cannot work in.
-- CREATE OR REPLACE keeps the existing owner and execute grants.
create or replace function public.check_in_qr(p_payload text, p_venue_id uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, public, private
as $$
declare
  v_club uuid := private.current_club_id();
  v_member public.members;
  v_checkin public.checkins;
  v_code text := upper(btrim(p_payload));
begin
  if v_club is null or private.can_operate_venue(v_club, p_venue_id) is not true then
    raise exception 'member or venue is outside assigned club';
  end if;
  if left(v_code, 4) = 'RP1|' then v_code := split_part(v_code, '|', 2); end if;
  select * into v_member from public.members m
  where m.club_id = v_club
    and (upper(m.member_code) = v_code or m.qr_token = btrim(p_payload))
  limit 1;
  if v_member.id is null then raise exception 'QR not recognized'; end if;
  v_checkin := public.check_in_member(v_member.id, p_venue_id, 'QR check-in');
  return jsonb_build_object(
    'checkin', to_jsonb(v_checkin),
    'member', jsonb_build_object('id', v_member.id, 'club_id', v_member.club_id, 'member_code', v_member.member_code, 'full_name', v_member.full_name, 'membership_type', v_member.membership_type, 'status', v_member.status, 'expiry_date', v_member.expiry_date)
  );
end;
$$;
