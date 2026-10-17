-- Club membership: a sign-up joins the club named by its join link, and
-- signed-in players can join further clubs. Staff and admin roles still come
-- only from trusted provisioning (club_staff_roles), never from sign-up data.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass and conname = 'members_club_user_key'
  ) then
    raise exception 'Club membership needs tenant enforcement first (members_club_user_key is missing).';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass and conname = 'members_user_id_key'
  ) then
    raise exception 'Club membership needs tenant enforcement first (members_user_id_key still exists).';
  end if;
  if to_regprocedure('private.is_platform_superadmin()') is null then
    raise exception 'Club membership needs the platform control migration first.';
  end if;
end;
$$;

-- Sign-up runs inside the auth service, where there is no API request and no
-- club header. The club comes from the join link's slug (club_slug in sign-up
-- metadata) or the default Rally Point Gensan club. The app checks the slug
-- with get_public_club() first; the exception here is a backstop.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_code text;
  v_slug text;
  v_club uuid;
begin
  v_name := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1));
  v_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');
  v_slug := nullif(lower(btrim(new.raw_user_meta_data ->> 'club_slug')), '');
  insert into public.profiles (id, email, full_name, role, phone)
  values (new.id, new.email, v_name, 'member', v_phone)
  on conflict (id) do nothing;

  if v_slug is not null then
    select c.id into v_club from public.clubs c where c.slug = v_slug and c.is_active;
    if v_club is null then
      raise exception 'This club link is not valid' using errcode = '22023';
    end if;
  else
    select c.id into v_club from public.clubs c where c.slug = 'rally-point-gensan' and c.is_active;
    -- With the default club closed, keep the profile and skip the membership
    -- rather than failing every sign-up.
    if v_club is null then
      return new;
    end if;
  end if;

  v_code := 'RP-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.members (
    club_id, user_id, member_code, full_name, email, phone,
    membership_type, status, join_date, expiry_date, qr_token
  )
  values (
    v_club, new.id, v_code, v_name, new.email, v_phone,
    'standard', 'active', current_date, current_date + 30,
    'q_' || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 24)
  )
  on conflict (club_id, user_id) do nothing;
  return new;
end;
$$;

-- Public club lookup for join links and the TV board: name and link only.
create or replace function public.get_public_club(p_slug text)
returns table (id uuid, slug text, name text)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name
  from public.clubs c
  where c.slug = lower(btrim(p_slug)) and c.is_active;
$$;

-- Every active club the caller belongs to, with their role there. It ignores
-- the club header so the app can offer a switcher before choosing a club.
create or replace function public.list_my_clubs()
returns table (club_id uuid, slug text, name text, role public.user_role)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name, private.current_club_role(c.id)
  from public.clubs c
  where c.is_active
    and private.current_club_role(c.id) is not null
  order by c.name, c.id;
$$;

-- A signed-in player joins another active club on the same terms as a new
-- sign-up (a 30-day active membership). Repeating it changes nothing.
create or replace function public.join_club(p_slug text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_club uuid;
  v_profile public.profiles;
begin
  if v_user is null then
    raise exception 'Please sign in to join a club' using errcode = '42501';
  end if;
  if private.is_platform_superadmin() then
    raise exception 'Platform accounts cannot join clubs' using errcode = '42501';
  end if;
  select c.id into v_club from public.clubs c where c.slug = lower(btrim(p_slug)) and c.is_active;
  if v_club is null then
    raise exception 'This club link is not valid' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles p where p.id = v_user;
  if v_profile.id is null then
    raise exception 'Your profile is not ready yet' using errcode = '42501';
  end if;
  insert into public.members (
    club_id, user_id, member_code, full_name, email, phone,
    membership_type, status, join_date, expiry_date, qr_token
  )
  values (
    v_club, v_user,
    'RP-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8)),
    v_profile.full_name, v_profile.email, v_profile.phone,
    'standard', 'active', current_date, current_date + 30,
    'q_' || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 24)
  )
  on conflict (club_id, user_id) do nothing;
  return v_club;
end;
$$;

alter function public.handle_new_user() owner to postgres;
alter function public.get_public_club(text) owner to postgres;
alter function public.list_my_clubs() owner to postgres;
alter function public.join_club(text) owner to postgres;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

revoke all on function public.get_public_club(text) from public;
grant execute on function public.get_public_club(text) to anon, authenticated;

revoke all on function public.list_my_clubs() from public, anon;
grant execute on function public.list_my_clubs() to authenticated;

revoke all on function public.join_club(text) from public, anon;
grant execute on function public.join_club(text) to authenticated;
