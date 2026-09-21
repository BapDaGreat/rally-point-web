begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select extensions.plan(30);

delete from private.auth_rate_limit_events;

select ok(
  to_regclass('private.auth_rate_limit_events') is not null,
  'rate-limit events are stored in the private schema'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'auth_rate_limit_events'
      and column_name in ('email', 'password', 'credential')
  ),
  'rate-limit storage has no raw credential columns'
);

select ok(
  not has_table_privilege('anon', 'private.auth_rate_limit_events', 'select'),
  'anonymous callers cannot read rate-limit records'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.auth_rate_limit_password_verification(jsonb)',
    'execute'
  ),
  'anonymous callers cannot invoke the password-verification hook'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'private.auth_rate_limit_password_verification(jsonb)',
    'execute'
  ),
  'Supabase Auth can invoke the password-verification hook'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.auth_rate_limit_before_user_created(jsonb)',
    'execute'
  ),
  'anonymous callers cannot invoke the before-user-created hook'
);

select ok(
  has_function_privilege(
    'supabase_auth_admin',
    'private.auth_rate_limit_before_user_created(jsonb)',
    'execute'
  ),
  'Supabase Auth can invoke the before-user-created hook'
);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'valid', false)
  )->>'decision',
  'continue',
  'first failed login is allowed'
);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'valid', false)
  )->>'decision',
  'continue',
  'second failed login is allowed'
);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'valid', false)
  )->>'decision',
  'continue',
  'third failed login is allowed'
);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'valid', false)
  )->>'decision',
  'continue',
  'fourth failed login is allowed'
);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'valid', false)
  )->>'decision',
  'continue',
  'fifth failed login is allowed'
);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'valid', false)
  )#>>'{error,http_code}',
  '429',
  'sixth failed login is rejected'
);

select ok(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '11111111-1111-1111-1111-111111111111', 'valid', false)
  )#>>'{error,message}' like 'Too many attempts. Please try again in about %',
  'the login rate-limit response is clear and generic'
);

delete from private.auth_rate_limit_events;

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '22222222-2222-2222-2222-222222222222', 'valid', false)
  )->>'decision',
  'continue',
  'a failed login before a successful login is allowed'
);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '22222222-2222-2222-2222-222222222222', 'valid', false)
  )->>'decision',
  'continue',
  'another failed login before success is allowed'
);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '22222222-2222-2222-2222-222222222222', 'valid', true)
  )->>'decision',
  'continue',
  'a successful login is allowed'
);

select is(
  (
    select count(*)::integer
    from private.auth_rate_limit_events
    where action = 'login'
      and subject_hash = private.auth_rate_limit_hash(
        'login-account',
        '22222222-2222-2222-2222-222222222222'
      )
  ),
  0,
  'a successful login resets failed-login attempts'
);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '22222222-2222-2222-2222-222222222222', 'valid', false)
  )->>'decision',
  'continue',
  'a new failed login is available after successful authentication'
);

delete from private.auth_rate_limit_events;

insert into private.auth_rate_limit_events (action, subject_hash, attempted_at)
select
  'login',
  private.auth_rate_limit_hash('login-account', '33333333-3333-3333-3333-333333333333'),
  clock_timestamp() - interval '5 minutes 1 second'
from generate_series(1, 5);

select is(
  private.auth_rate_limit_password_verification(
    jsonb_build_object('user_id', '33333333-3333-3333-3333-333333333333', 'valid', false)
  )->>'decision',
  'continue',
  'a failed login is available after the rolling five-minute window expires'
);

delete from private.auth_rate_limit_events;

select is(
  private.auth_rate_limit_before_user_created(
    jsonb_build_object(
      'metadata', jsonb_build_object('ip_address', '203.0.113.10'),
      'user', jsonb_build_object('email', 'new-player@example.com')
    )
  )::text,
  '{}'::jsonb::text,
  'first signup attempt is allowed'
);

select is(
  private.auth_rate_limit_before_user_created(
    jsonb_build_object(
      'metadata', jsonb_build_object('ip_address', '203.0.113.10'),
      'user', jsonb_build_object('email', 'new-player@example.com')
    )
  )::text,
  '{}'::jsonb::text,
  'second signup attempt is allowed'
);

select is(
  private.auth_rate_limit_before_user_created(
    jsonb_build_object(
      'metadata', jsonb_build_object('ip_address', '203.0.113.10'),
      'user', jsonb_build_object('email', 'new-player@example.com')
    )
  )::text,
  '{}'::jsonb::text,
  'third signup attempt is allowed'
);

select is(
  private.auth_rate_limit_before_user_created(
    jsonb_build_object(
      'metadata', jsonb_build_object('ip_address', '203.0.113.10'),
      'user', jsonb_build_object('email', 'new-player@example.com')
    )
  )::text,
  '{}'::jsonb::text,
  'fourth signup attempt is allowed'
);

select is(
  private.auth_rate_limit_before_user_created(
    jsonb_build_object(
      'metadata', jsonb_build_object('ip_address', '203.0.113.10'),
      'user', jsonb_build_object('email', 'new-player@example.com')
    )
  )::text,
  '{}'::jsonb::text,
  'fifth signup attempt is allowed'
);

select is(
  private.auth_rate_limit_before_user_created(
    jsonb_build_object(
      'metadata', jsonb_build_object('ip_address', '203.0.113.10'),
      'user', jsonb_build_object('email', 'new-player@example.com')
    )
  )#>>'{error,http_code}',
  '429',
  'sixth signup attempt is rejected'
);

delete from private.auth_rate_limit_events;

insert into private.auth_rate_limit_events (action, subject_hash, attempted_at)
select
  'signup',
  private.auth_rate_limit_hash('signup-email', 'window-player@example.com'),
  clock_timestamp() - interval '5 minutes 1 second'
from generate_series(1, 5);

insert into private.auth_rate_limit_events (action, subject_hash, attempted_at)
select
  'signup',
  private.auth_rate_limit_hash('signup-ip', '203.0.113.11'),
  clock_timestamp() - interval '5 minutes 1 second'
from generate_series(1, 5);

select is(
  private.auth_rate_limit_before_user_created(
    jsonb_build_object(
      'metadata', jsonb_build_object('ip_address', '203.0.113.11'),
      'user', jsonb_build_object('email', 'window-player@example.com')
    )
  )::text,
  '{}'::jsonb::text,
  'a signup is available after the rolling five-minute window expires'
);

delete from private.auth_rate_limit_events;

insert into private.auth_rate_limit_events (action, subject_hash, attempted_at)
select
  'login',
  private.auth_rate_limit_hash('login-account', '44444444-4444-4444-4444-444444444444'),
  clock_timestamp()
from generate_series(1, 5);

select is(
  private.auth_rate_limit_check(
    'login',
    private.auth_rate_limit_hash(
      'login-account',
      '44444444-4444-4444-4444-444444444444'
    ),
    clock_timestamp()
  )->>'allowed',
  'false',
  'server records still block login after a client refresh or authentication-mode switch'
);

delete from private.auth_rate_limit_events;

select is(
  private.auth_rate_limit_check(
    'login',
    private.auth_rate_limit_hash('shared-subject', 'no-client-state'),
    clock_timestamp()
  )->>'allowed',
  'true',
  'a login limit does not consume a signup limit'
);

select is(
  private.auth_rate_limit_check(
    'signup',
    private.auth_rate_limit_hash('shared-subject', 'no-client-state'),
    clock_timestamp()
  )->>'allowed',
  'true',
  'the separate signup action remains available for the same safe identifier'
);

select * from extensions.finish();

rollback;
