-- Support sessions: a platform superadmin may look at one club, read-only, for a
-- limited time and a stated reason. Every start, look and end is logged. There
-- is no editing path, and no policy gives superadmins club rows: everything goes
-- through the functions below, which return a summary without member details.

do $$
begin
  if to_regprocedure('private.require_platform_superadmin()') is null
     or to_regprocedure('private.platform_audit(text, uuid, jsonb)') is null then
    raise exception 'Support sessions need the platform control migration first.';
  end if;
end;
$$;

create table public.platform_support_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 10 and 500),
  started_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  check (expires_at > started_at and expires_at <= started_at + interval '2 hours')
);
create index platform_support_sessions_actor_idx on public.platform_support_sessions (actor_id, started_at desc);

-- The caller's own session, refused once it has ended or expired.
create or replace function private.open_support_session(p_session_id uuid)
returns public.platform_support_sessions
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v public.platform_support_sessions;
begin
  perform private.require_platform_superadmin();
  select * into v from public.platform_support_sessions s
  where s.id = p_session_id and s.actor_id = (select auth.uid());
  if v.id is null then
    raise exception 'Support session not found' using errcode = 'P0002';
  end if;
  if v.ended_at is not null or v.expires_at <= clock_timestamp() then
    raise exception 'This support session has ended' using errcode = '42501';
  end if;
  return v;
end;
$$;

create or replace function public.platform_start_support_session(p_club_id uuid, p_reason text, p_minutes integer default 60)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_minutes integer := coalesce(p_minutes, 60);
  v_id uuid;
begin
  perform private.require_platform_superadmin();
  if not exists (select 1 from public.clubs c where c.id = p_club_id) then
    raise exception 'Club not found' using errcode = 'P0002';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'Give a reason of at least 10 characters' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters' using errcode = '22023';
  end if;
  if v_minutes < 5 or v_minutes > 120 then
    raise exception 'Choose between 5 and 120 minutes' using errcode = '22023';
  end if;

  -- One open session at a time: close any others, and log that they were replaced.
  with ended as (
    update public.platform_support_sessions s
    set ended_at = v_now
    where s.actor_id = (select auth.uid()) and s.ended_at is null and s.expires_at > v_now
    returning s.id, s.club_id
  )
  insert into public.platform_audit_log (actor_id, actor_label, action, club_id, details)
  select (select auth.uid()), session_user, 'support.end', e.club_id,
         jsonb_build_object('session_id', e.id, 'ended_by', 'new session')
  from ended e;

  insert into public.platform_support_sessions (club_id, actor_id, reason, started_at, expires_at)
  values (p_club_id, (select auth.uid()), v_reason, v_now, v_now + make_interval(mins => v_minutes))
  returning id into v_id;
  perform private.platform_audit('support.start', p_club_id, jsonb_build_object(
    'session_id', v_id, 'reason', v_reason, 'minutes', v_minutes
  ));
  return v_id;
end;
$$;

create or replace function public.platform_end_support_session(p_session_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club uuid;
begin
  perform private.require_platform_superadmin();
  update public.platform_support_sessions s
  set ended_at = clock_timestamp()
  where s.id = p_session_id and s.actor_id = (select auth.uid()) and s.ended_at is null
  returning s.club_id into v_club;
  if v_club is null then
    raise exception 'Support session not found or already ended' using errcode = 'P0002';
  end if;
  perform private.platform_audit('support.end', v_club, jsonb_build_object('session_id', p_session_id));
end;
$$;

create or replace function public.platform_my_support_sessions()
returns table (
  id uuid, club_id uuid, club_name text, reason text,
  started_at timestamptz, expires_at timestamptz, ended_at timestamptz, is_open boolean
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_platform_superadmin();
  return query
  select s.id, s.club_id, c.name, s.reason, s.started_at, s.expires_at, s.ended_at,
         (s.ended_at is null and s.expires_at > clock_timestamp())
  from public.platform_support_sessions s
  join public.clubs c on c.id = s.club_id
  where s.actor_id = (select auth.uid())
  order by s.started_at desc, s.id
  limit 20;
end;
$$;

-- What support sees: club settings, counts, today's schedule and open inquiries.
-- No member names, contact details or payment records. Each call is logged.
create or replace function public.platform_support_snapshot(p_session_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_session public.platform_support_sessions;
  v_club public.clubs;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_result jsonb;
begin
  v_session := private.open_support_session(p_session_id);
  select * into v_club from public.clubs c where c.id = v_session.club_id;
  -- "Today" in the club's own time zone.
  v_day_start := date_trunc('day', clock_timestamp() at time zone v_club.default_timezone) at time zone v_club.default_timezone;
  v_day_end := v_day_start + interval '1 day';

  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id, 'club_id', v_session.club_id, 'reason', v_session.reason,
      'started_at', v_session.started_at, 'expires_at', v_session.expires_at
    ),
    'club', jsonb_build_object(
      'id', v_club.id, 'name', v_club.name, 'slug', v_club.slug, 'is_active', v_club.is_active,
      'status', (select a.status from public.club_accounts a where a.club_id = v_club.id)
    ),
    'venues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'is_active', v.is_active,
        'courts', (select count(*) from public.courts ct where ct.club_id = v.club_id and ct.venue_id = v.id)
      ) order by v.name)
      from public.venues v where v.club_id = v_club.id
    ), '[]'::jsonb),
    'members', jsonb_build_object(
      'total', (select count(*) from public.members m where m.club_id = v_club.id),
      'active', (select count(*) from public.members m where m.club_id = v_club.id and m.status = 'active'),
      'expired', (select count(*) from public.members m where m.club_id = v_club.id and m.status = 'expired')
    ),
    'staff_count', (select count(*) from public.club_staff_roles r where r.club_id = v_club.id and r.is_active),
    'today', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', b.kind, 'court_name', b.court_name, 'venue_name', b.venue_name,
        'start_at', b.start_at, 'end_at', b.end_at, 'status', b.status
      ) order by b.start_at, b.court_name)
      from (
        select 'session'::text as kind, ct.name as court_name, v.name as venue_name, s.start_at, s.end_at, s.status::text as status
        from public.court_sessions s
        join public.courts ct on ct.id = s.court_id and ct.club_id = s.club_id
        join public.venues v on v.id = s.venue_id and v.club_id = s.club_id
        where s.club_id = v_club.id and s.status in ('scheduled', 'playing', 'pending_payment')
          and s.start_at < v_day_end and s.end_at > v_day_start
        union all
        select 'booking', ct.name, v.name, bk.start_at, bk.end_at, bk.status::text
        from public.bookings bk
        join public.courts ct on ct.id = bk.court_id and ct.club_id = bk.club_id
        join public.venues v on v.id = bk.venue_id and v.club_id = bk.club_id
        where bk.club_id = v_club.id and bk.session_id is null and bk.status in ('pending_payment', 'confirmed')
          and bk.start_at < v_day_end and bk.end_at > v_day_start
        union all
        select 'open_play', coalesce(ct.name, 'Open floor'), v.name, o.start_at, o.end_at, o.status::text
        from public.open_plays o
        left join public.courts ct on ct.id = o.court_id and ct.club_id = o.club_id
        join public.venues v on v.id = o.venue_id and v.club_id = o.club_id
        where o.club_id = v_club.id and o.status in ('open', 'full')
          and o.start_at < v_day_end and o.end_at > v_day_start
      ) b
    ), '[]'::jsonb),
    'open_inquiries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', i.category, 'subject', i.subject, 'status', i.status, 'created_at', i.created_at
      ) order by i.created_at desc)
      from (
        select si.category, si.subject, si.status, si.created_at
        from public.support_inquiries si
        where si.club_id = v_club.id and si.status <> 'resolved'
        order by si.created_at desc
        limit 20
      ) i
    ), '[]'::jsonb)
  ) into v_result;

  perform private.platform_audit('support.read', v_club.id, jsonb_build_object('session_id', v_session.id));
  return v_result;
end;
$$;

alter table public.platform_support_sessions enable row level security;
revoke all on table public.platform_support_sessions from public, anon, authenticated;

alter function private.open_support_session(uuid) owner to postgres;
revoke all on function private.open_support_session(uuid) from public, anon, authenticated;

alter function public.platform_start_support_session(uuid, text, integer) owner to postgres;
alter function public.platform_end_support_session(uuid) owner to postgres;
alter function public.platform_my_support_sessions() owner to postgres;
alter function public.platform_support_snapshot(uuid) owner to postgres;
revoke all on function public.platform_start_support_session(uuid, text, integer) from public, anon;
revoke all on function public.platform_end_support_session(uuid) from public, anon;
revoke all on function public.platform_my_support_sessions() from public, anon;
revoke all on function public.platform_support_snapshot(uuid) from public, anon;
grant execute on function public.platform_start_support_session(uuid, text, integer) to authenticated;
grant execute on function public.platform_end_support_session(uuid) to authenticated;
grant execute on function public.platform_my_support_sessions() to authenticated;
grant execute on function public.platform_support_snapshot(uuid) to authenticated;
