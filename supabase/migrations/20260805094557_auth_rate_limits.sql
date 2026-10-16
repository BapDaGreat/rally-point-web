-- Server-side authentication rate limits.
-- Only SHA-256 hashes, action names, and timestamps are retained; never credentials.

create extension if not exists pgcrypto with schema extensions;

create table private.auth_rate_limit_events (
  id bigint generated always as identity primary key,
  action text not null check (action in ('login', 'signup')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  attempted_at timestamptz not null default pg_catalog.clock_timestamp()
);

create index auth_rate_limit_events_lookup_idx
  on private.auth_rate_limit_events (action, subject_hash, attempted_at);

create index auth_rate_limit_events_expiry_idx
  on private.auth_rate_limit_events (attempted_at);

alter table private.auth_rate_limit_events enable row level security;

revoke all on table private.auth_rate_limit_events from public;
revoke all on table private.auth_rate_limit_events from anon;
revoke all on table private.auth_rate_limit_events from authenticated;

comment on table private.auth_rate_limit_events is
  'Short-lived hashed authentication-attempt records. Never stores email addresses or passwords.';

create or replace function private.auth_rate_limit_hash(
  p_namespace text,
  p_value text
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(p_namespace || ':' || p_value, 'sha256'),
    'hex'
  );
$$;

create or replace function private.auth_rate_limit_check(
  p_action text,
  p_subject_hash text,
  p_at timestamptz default pg_catalog.clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_count integer;
  v_oldest_attempt timestamptz;
  v_retry_after_seconds integer;
begin
  if p_action not in ('login', 'signup') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported authentication rate-limit action';
  end if;

  if p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'Invalid authentication rate-limit subject';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_action || ':' || p_subject_hash, 0)
  );

  delete from private.auth_rate_limit_events
  where attempted_at <= p_at - interval '5 minutes';

  select
    count(*)::integer,
    min(attempted_at)
  into
    v_attempt_count,
    v_oldest_attempt
  from private.auth_rate_limit_events
  where action = p_action
    and subject_hash = p_subject_hash
    and attempted_at > p_at - interval '5 minutes';

  if v_attempt_count >= 5 then
    v_retry_after_seconds := greatest(
      1,
      ceil(
        extract(epoch from (v_oldest_attempt + interval '5 minutes' - p_at))
      )::integer
    );

    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry_after_seconds
    );
  end if;

  insert into private.auth_rate_limit_events (action, subject_hash, attempted_at)
  values (p_action, p_subject_hash, p_at);

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'retry_after_seconds', 0
  );
end;
$$;

create or replace function private.auth_rate_limit_message(
  p_retry_after_seconds integer
)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_minutes integer;
begin
  v_minutes := greatest(1, ceil(p_retry_after_seconds / 60.0)::integer);

  return pg_catalog.format(
    'Too many attempts. Please try again in about %s minute%s.',
    v_minutes,
    case when v_minutes = 1 then '' else 's' end
  );
end;
$$;

create or replace function private.auth_rate_limit_password_verification(
  event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id text;
  v_subject_hash text;
  v_result jsonb;
  v_retry_after_seconds integer;
begin
  v_user_id := nullif(btrim(event ->> 'user_id'), '');

  if v_user_id is null then
    return pg_catalog.jsonb_build_object(
      'error',
      pg_catalog.jsonb_build_object(
        'http_code', 400,
        'message', 'Unable to sign in. Please try again.'
      )
    );
  end if;

  v_subject_hash := private.auth_rate_limit_hash('login-account', v_user_id);

  -- Supabase Auth has already verified the password. A valid password clears
  -- prior failures before issuing the session, as recommended for this hook.
  if event -> 'valid' = 'true'::jsonb then
    delete from private.auth_rate_limit_events
    where action = 'login'
      and subject_hash = v_subject_hash;

    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  v_result := private.auth_rate_limit_check(
    'login',
    v_subject_hash,
    pg_catalog.clock_timestamp()
  );

  if (v_result ->> 'allowed')::boolean then
    return pg_catalog.jsonb_build_object('decision', 'continue');
  end if;

  v_retry_after_seconds := (v_result ->> 'retry_after_seconds')::integer;

  return pg_catalog.jsonb_build_object(
    'error',
    pg_catalog.jsonb_build_object(
      'http_code', 429,
      'message', private.auth_rate_limit_message(v_retry_after_seconds)
    )
  );
end;
$$;

create or replace function private.auth_rate_limit_before_user_created(
  event jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_ip_address text;
  v_result jsonb;
  v_retry_after_seconds integer;
begin
  v_email := nullif(lower(btrim(event #>> '{user,email}')), '');

  if v_email is null then
    return pg_catalog.jsonb_build_object(
      'error',
      pg_catalog.jsonb_build_object(
        'http_code', 400,
        'message', 'Unable to create an account. Please try again.'
      )
    );
  end if;

  v_result := private.auth_rate_limit_check(
    'signup',
    private.auth_rate_limit_hash('signup-email', v_email),
    pg_catalog.clock_timestamp()
  );

  if not (v_result ->> 'allowed')::boolean then
    v_retry_after_seconds := (v_result ->> 'retry_after_seconds')::integer;

    return pg_catalog.jsonb_build_object(
      'error',
      pg_catalog.jsonb_build_object(
        'http_code', 429,
        'message', private.auth_rate_limit_message(v_retry_after_seconds)
      )
    );
  end if;

  v_ip_address := nullif(btrim(event #>> '{metadata,ip_address}'), '');

  if v_ip_address is not null then
    v_result := private.auth_rate_limit_check(
      'signup',
      private.auth_rate_limit_hash('signup-ip', v_ip_address),
      pg_catalog.clock_timestamp()
    );

    if not (v_result ->> 'allowed')::boolean then
      v_retry_after_seconds := (v_result ->> 'retry_after_seconds')::integer;

      return pg_catalog.jsonb_build_object(
        'error',
        pg_catalog.jsonb_build_object(
          'http_code', 429,
          'message', private.auth_rate_limit_message(v_retry_after_seconds)
        )
      );
    end if;
  end if;

  return '{}'::jsonb;
end;
$$;

alter function private.auth_rate_limit_hash(text, text) owner to postgres;
alter function private.auth_rate_limit_check(text, text, timestamptz) owner to postgres;
alter function private.auth_rate_limit_message(integer) owner to postgres;
alter function private.auth_rate_limit_password_verification(jsonb) owner to postgres;
alter function private.auth_rate_limit_before_user_created(jsonb) owner to postgres;

revoke all on function private.auth_rate_limit_hash(text, text) from public;
revoke all on function private.auth_rate_limit_hash(text, text) from anon;
revoke all on function private.auth_rate_limit_hash(text, text) from authenticated;
revoke all on function private.auth_rate_limit_check(text, text, timestamptz) from public;
revoke all on function private.auth_rate_limit_check(text, text, timestamptz) from anon;
revoke all on function private.auth_rate_limit_check(text, text, timestamptz) from authenticated;
revoke all on function private.auth_rate_limit_message(integer) from public;
revoke all on function private.auth_rate_limit_message(integer) from anon;
revoke all on function private.auth_rate_limit_message(integer) from authenticated;
revoke all on function private.auth_rate_limit_password_verification(jsonb) from public;
revoke all on function private.auth_rate_limit_password_verification(jsonb) from anon;
revoke all on function private.auth_rate_limit_password_verification(jsonb) from authenticated;
revoke all on function private.auth_rate_limit_before_user_created(jsonb) from public;
revoke all on function private.auth_rate_limit_before_user_created(jsonb) from anon;
revoke all on function private.auth_rate_limit_before_user_created(jsonb) from authenticated;

grant usage on schema private to supabase_auth_admin;
grant execute
  on function private.auth_rate_limit_password_verification(jsonb)
  to supabase_auth_admin;
grant execute
  on function private.auth_rate_limit_before_user_created(jsonb)
  to supabase_auth_admin;

comment on function private.auth_rate_limit_password_verification(jsonb) is
  'Supabase Auth Password Verification Hook. Keeps only hashed failed-login attempts.';

comment on function private.auth_rate_limit_before_user_created(jsonb) is
  'Supabase Auth Before User Created Hook. Limits signups with hashed email and IP identifiers.';
