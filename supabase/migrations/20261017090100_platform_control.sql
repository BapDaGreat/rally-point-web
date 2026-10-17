-- Platform control: a trusted superadmin role, club accounts, an audit log and a
-- commission ledger. Superadmins work only through the audited functions below;
-- no policy gives them club rows, and club access rules are unchanged.
-- Commission rows are records of charges the app recorded. Payments are still
-- simulated, so they are not collected money.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass and conname = 'members_club_user_key'
  ) then
    raise exception 'Platform control needs tenant enforcement first (members_club_user_key is missing).';
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.members'::regclass and conname = 'members_user_id_key'
  ) then
    raise exception 'Platform control needs tenant enforcement first (members_user_id_key still exists).';
  end if;
  if has_table_privilege('authenticated', 'public.transactions', 'INSERT')
     or has_table_privilege('anon', 'public.transactions', 'INSERT') then
    raise exception 'Platform control needs direct transaction writes to stay revoked.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Trusted provisioning only: operators add rows with database access.
create table public.platform_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'superadmin' check (role = 'superadmin'),
  note text,
  granted_at timestamptz not null default now()
);

-- Platform-owned commercial terms. Kept out of public.clubs, which any signed-in
-- user may read for the club they name.
create table public.club_accounts (
  club_id uuid primary key references public.clubs (id) on delete cascade,
  status text not null default 'active' check (status in ('provisioning', 'active', 'suspended')),
  commission_rate numeric(5,2) not null default 5.00 check (commission_rate >= 0 and commission_rate <= 100),
  city text,
  address text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_label text,
  action text not null,
  club_id uuid,
  details jsonb not null default '{}'::jsonb,
  -- The actual time of each action, so several changes in one request keep their order.
  created_at timestamptz not null default clock_timestamp()
);
create index platform_audit_log_created_idx on public.platform_audit_log (created_at desc);

create table public.platform_commissions (
  id uuid primary key default extensions.gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  venue_id uuid,
  transaction_id uuid not null unique references public.transactions (id) on delete cascade,
  gross_amount numeric(12,2) not null check (gross_amount > 0),
  commission_rate numeric(5,2) not null check (commission_rate >= 0 and commission_rate <= 100),
  commission_amount numeric(12,2) not null check (commission_amount >= 0),
  club_net_amount numeric(12,2) not null,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (club_id, venue_id) references public.venues (club_id, id) on delete cascade
);
create index platform_commissions_club_created_idx on public.platform_commissions (club_id, created_at desc);

-- Every existing club gets an account; later clubs get one from the trigger below.
insert into public.club_accounts (club_id, status)
select c.id, case when c.is_active then 'active' else 'provisioning' end
from public.clubs c
on conflict (club_id) do nothing;

-- ---------------------------------------------------------------------------
-- Private helpers
-- ---------------------------------------------------------------------------

create or replace function private.is_platform_superadmin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_roles r
    where r.user_id = (select auth.uid()) and r.role = 'superadmin'
  );
$$;

create or replace function private.require_platform_superadmin()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_superadmin() then
    raise exception 'Platform access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.platform_audit(p_action text, p_club_id uuid, p_details jsonb)
returns void
language sql volatile security definer set search_path = ''
as $$
  insert into public.platform_audit_log (actor_id, actor_label, action, club_id, details)
  values ((select auth.uid()), session_user, p_action, p_club_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function private.create_club_account()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.club_accounts (club_id, status)
  values (new.id, case when new.is_active then 'active' else 'provisioning' end)
  on conflict (club_id) do nothing;
  return null;
end;
$$;

create trigger clubs_create_account
after insert on public.clubs
for each row execute function private.create_club_account();

create or replace function private.audit_platform_roles()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.platform_audit_log (actor_id, actor_label, action, details)
  values (
    (select auth.uid()),
    session_user,
    'platform_role.' || lower(tg_op),
    jsonb_build_object(
      'user_id', coalesce(new.user_id, old.user_id),
      'role', coalesce(new.role, old.role)
    )
  );
  return null;
end;
$$;

create trigger platform_roles_audit
after insert or update or delete on public.platform_roles
for each row execute function private.audit_platform_roles();

-- Court time earns platform commission: online bookings, desk rentals and
-- extensions. Walk-ins and membership fees stay with the club. The ledger must
-- never stop a charge from being recorded, so failures only raise a warning.
create or replace function private.record_platform_commission()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_rate numeric(5,2);
  v_commission numeric(12,2);
begin
  begin
    select a.commission_rate into v_rate from public.club_accounts a where a.club_id = new.club_id;
    v_rate := coalesce(v_rate, 5.00);
    v_commission := round(new.amount * v_rate / 100, 2);
    insert into public.platform_commissions (
      club_id, venue_id, transaction_id, gross_amount, commission_rate,
      commission_amount, club_net_amount, verification_status
    )
    values (
      new.club_id, new.venue_id, new.id, new.amount, v_rate,
      v_commission, new.amount - v_commission, coalesce(new.verification_status, 'unverified')
    )
    on conflict (transaction_id) do nothing;
  exception when others then
    raise warning 'Platform commission not recorded for transaction %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger transactions_record_platform_commission
after insert on public.transactions
for each row
when (new.type in ('booking', 'court_rental', 'extension') and new.amount > 0)
execute function private.record_platform_commission();

create or replace function private.sync_platform_commission_verification()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.platform_commissions
  set verification_status = new.verification_status
  where transaction_id = new.id
    and verification_status is distinct from new.verification_status;
  return null;
end;
$$;

create trigger transactions_sync_platform_commission
after update of verification_status on public.transactions
for each row
when (new.verification_status is distinct from old.verification_status)
execute function private.sync_platform_commission_verification();

-- ---------------------------------------------------------------------------
-- Club admins may read their own club's terms and commission lines.
-- ---------------------------------------------------------------------------

create policy club_accounts_admin_select on public.club_accounts
for select to authenticated
using (
  club_id = (select private.current_club_id())
  and private.current_club_role(club_id) = 'admin'
);

create policy platform_commissions_admin_select on public.platform_commissions
for select to authenticated
using (
  club_id = (select private.current_club_id())
  and private.current_club_role(club_id) = 'admin'
);

-- ---------------------------------------------------------------------------
-- Platform functions (superadmin only, audited)
-- ---------------------------------------------------------------------------

create or replace function public.get_platform_access()
returns text
language sql stable security definer set search_path = ''
as $$
  select case when private.is_platform_superadmin() then 'superadmin' end;
$$;

create or replace function public.platform_list_clubs()
returns table (
  club_id uuid, slug text, name text, status text, commission_rate numeric,
  city text, address text, contact_email text, contact_phone text,
  venue_count bigint, court_count bigint, member_count bigint, admin_count bigint,
  gross_amount numeric, commission_amount numeric, club_net_amount numeric,
  entry_count bigint, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_platform_superadmin();
  return query
  select
    c.id, c.slug, c.name,
    coalesce(a.status, case when c.is_active then 'active' else 'provisioning' end),
    coalesce(a.commission_rate, 5.00),
    a.city, a.address, a.contact_email, a.contact_phone,
    (select count(*) from public.venues v where v.club_id = c.id),
    (select count(*) from public.courts ct where ct.club_id = c.id),
    (select count(*) from public.members m where m.club_id = c.id),
    (select count(*) from public.club_staff_roles r where r.club_id = c.id and r.role = 'admin' and r.is_active),
    coalesce((select sum(pc.gross_amount) from public.platform_commissions pc where pc.club_id = c.id), 0),
    coalesce((select sum(pc.commission_amount) from public.platform_commissions pc where pc.club_id = c.id), 0),
    coalesce((select sum(pc.club_net_amount) from public.platform_commissions pc where pc.club_id = c.id), 0),
    (select count(*) from public.platform_commissions pc where pc.club_id = c.id),
    c.created_at
  from public.clubs c
  left join public.club_accounts a on a.club_id = c.id
  order by c.name, c.id;
end;
$$;

create or replace function public.platform_commission_ledger(p_club_id uuid default null, p_limit integer default 200)
returns table (
  id uuid, club_id uuid, club_name text, venue_id uuid, transaction_id uuid,
  description text, gross_amount numeric, commission_rate numeric,
  commission_amount numeric, club_net_amount numeric,
  verification_status text, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_platform_superadmin();
  return query
  select pc.id, pc.club_id, c.name, pc.venue_id, pc.transaction_id, t.description,
         pc.gross_amount, pc.commission_rate, pc.commission_amount, pc.club_net_amount,
         pc.verification_status, pc.created_at
  from public.platform_commissions pc
  join public.clubs c on c.id = pc.club_id
  join public.transactions t on t.id = pc.transaction_id
  where p_club_id is null or pc.club_id = p_club_id
  order by pc.created_at desc, pc.id
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

-- A new club starts in setup (inactive, hidden from players) with one venue and
-- its courts. Court writes are otherwise paused for the release, so this audited
-- definer path is the only way a new club gets courts; flagged for release review.
create or replace function public.platform_provision_club(
  p_name text,
  p_slug text,
  p_city text,
  p_address text,
  p_contact_email text,
  p_contact_phone text,
  p_commission_rate numeric,
  p_court_count integer default 2
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_club uuid := extensions.gen_random_uuid();
  v_venue uuid := extensions.gen_random_uuid();
  v_name text := btrim(coalesce(p_name, ''));
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_courts integer := coalesce(p_court_count, 2);
begin
  perform private.require_platform_superadmin();
  if v_name = '' then
    raise exception 'Enter the club name' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' then
    raise exception 'Use 3 to 50 lowercase letters, numbers or dashes for the link name' using errcode = '22023';
  end if;
  if exists (select 1 from public.clubs c where c.slug = v_slug) then
    raise exception 'That link name is already used by another club' using errcode = '23505';
  end if;
  if p_commission_rate is null or p_commission_rate < 0 or p_commission_rate > 100 then
    raise exception 'Commission rate must be between 0 and 100' using errcode = '22023';
  end if;
  if v_courts < 1 or v_courts > 12 then
    raise exception 'Choose between 1 and 12 courts' using errcode = '22023';
  end if;

  insert into public.clubs (id, slug, name, is_active) values (v_club, v_slug, v_name, false);
  -- The clubs trigger created a provisioning account; fill in the agreed terms.
  update public.club_accounts
  set status = 'provisioning',
      commission_rate = p_commission_rate,
      city = nullif(btrim(p_city), ''),
      address = nullif(btrim(p_address), ''),
      contact_email = nullif(lower(btrim(p_contact_email)), ''),
      contact_phone = nullif(btrim(p_contact_phone), ''),
      updated_at = now()
  where club_id = v_club;
  insert into public.venues (id, club_id, slug, name) values (v_venue, v_club, 'main', v_name);
  insert into public.courts (club_id, venue_id, name)
  select v_club, v_venue, 'Court ' || n from generate_series(1, v_courts) as n;

  perform private.platform_audit('club.provision', v_club, jsonb_build_object(
    'slug', v_slug, 'name', v_name, 'commission_rate', p_commission_rate, 'court_count', v_courts
  ));
  return v_club;
end;
$$;

create or replace function public.platform_set_club_status(p_club_id uuid, p_status text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_old text;
  v_slug text;
begin
  perform private.require_platform_superadmin();
  if p_status is null or p_status not in ('provisioning', 'active', 'suspended') then
    raise exception 'Unknown club status' using errcode = '22023';
  end if;
  select a.status, c.slug into v_old, v_slug
  from public.clubs c
  join public.club_accounts a on a.club_id = c.id
  where c.id = p_club_id
  for update of a;
  if v_slug is null then
    raise exception 'Club not found' using errcode = 'P0002';
  end if;
  -- Sign-ups without a club link join this club, so it must stay open.
  if v_slug = 'rally-point-gensan' and p_status <> 'active' then
    raise exception 'The default sign-up club must stay active' using errcode = '22023';
  end if;
  if p_status = 'active' and not exists (
    select 1 from public.club_staff_roles r
    where r.club_id = p_club_id and r.role = 'admin' and r.is_active
  ) then
    raise exception 'Assign a club admin before activating this club' using errcode = '22023';
  end if;
  update public.club_accounts set status = p_status, updated_at = now() where club_id = p_club_id;
  update public.clubs set is_active = (p_status = 'active') where id = p_club_id;
  perform private.platform_audit('club.status', p_club_id, jsonb_build_object('from', v_old, 'to', p_status));
end;
$$;

create or replace function public.platform_set_commission_rate(p_club_id uuid, p_rate numeric)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_old numeric;
begin
  perform private.require_platform_superadmin();
  if p_rate is null or p_rate < 0 or p_rate > 100 then
    raise exception 'Commission rate must be between 0 and 100' using errcode = '22023';
  end if;
  select a.commission_rate into v_old from public.club_accounts a where a.club_id = p_club_id for update;
  if not found then
    raise exception 'Club not found' using errcode = 'P0002';
  end if;
  update public.club_accounts set commission_rate = p_rate, updated_at = now() where club_id = p_club_id;
  perform private.platform_audit('club.commission_rate', p_club_id, jsonb_build_object('from', v_old, 'to', p_rate));
end;
$$;

-- The person must already have an account (they sign up through the club link).
create or replace function public.platform_assign_club_admin(p_club_id uuid, p_email text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
begin
  perform private.require_platform_superadmin();
  if not exists (select 1 from public.clubs c where c.id = p_club_id) then
    raise exception 'Club not found' using errcode = 'P0002';
  end if;
  select u.id into v_user
  from auth.users u
  where lower(u.email) = v_email
    and u.deleted_at is null
    and coalesce(u.is_sso_user, false) = false
    and exists (select 1 from public.profiles p where p.id = u.id)
  limit 1;
  if v_user is null then
    raise exception 'No account uses that email yet. Ask them to sign up first.' using errcode = 'P0002';
  end if;
  insert into public.club_staff_roles (club_id, user_id, role, is_active)
  values (p_club_id, v_user, 'admin', true)
  on conflict (club_id, user_id) do update set role = 'admin', is_active = true;
  perform private.platform_audit('club.admin_assign', p_club_id, jsonb_build_object('user_id', v_user, 'email', v_email));
  return v_user;
end;
$$;

create or replace function public.platform_revoke_club_admin(p_club_id uuid, p_user_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.require_platform_superadmin();
  update public.club_staff_roles
  set is_active = false
  where club_id = p_club_id and user_id = p_user_id and role = 'admin' and is_active;
  if not found then
    raise exception 'That person is not an active admin of this club' using errcode = 'P0002';
  end if;
  perform private.platform_audit('club.admin_revoke', p_club_id, jsonb_build_object('user_id', p_user_id));
end;
$$;

-- Active admins of one club (name and email only), so the superadmin can remove one.
create or replace function public.platform_club_admins(p_club_id uuid)
returns table (user_id uuid, email text, full_name text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_platform_superadmin();
  return query
  select p.id, p.email, p.full_name
  from public.club_staff_roles r
  join public.profiles p on p.id = r.user_id
  where r.club_id = p_club_id and r.role = 'admin' and r.is_active
  order by p.full_name, p.id;
end;
$$;

create or replace function public.platform_recent_actions(p_limit integer default 50)
returns table (
  id uuid, actor_email text, action text, club_id uuid, club_name text,
  details jsonb, created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_platform_superadmin();
  return query
  select l.id, coalesce(u.email::text, l.actor_label), l.action, l.club_id, c.name, l.details, l.created_at
  from public.platform_audit_log l
  left join auth.users u on u.id = l.actor_id
  left join public.clubs c on c.id = l.club_id
  order by l.created_at desc, l.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership, row security and grants. New objects get no privileges by default.
-- ---------------------------------------------------------------------------

alter table public.platform_roles enable row level security;
alter table public.club_accounts enable row level security;
alter table public.platform_audit_log enable row level security;
alter table public.platform_commissions enable row level security;

revoke all on table public.platform_roles from public, anon, authenticated;
revoke all on table public.club_accounts from public, anon, authenticated;
revoke all on table public.platform_audit_log from public, anon, authenticated;
revoke all on table public.platform_commissions from public, anon, authenticated;
grant select on table public.club_accounts to authenticated;
grant select on table public.platform_commissions to authenticated;

alter function private.is_platform_superadmin() owner to postgres;
alter function private.require_platform_superadmin() owner to postgres;
alter function private.platform_audit(text, uuid, jsonb) owner to postgres;
alter function private.create_club_account() owner to postgres;
alter function private.audit_platform_roles() owner to postgres;
alter function private.record_platform_commission() owner to postgres;
alter function private.sync_platform_commission_verification() owner to postgres;
revoke all on function private.is_platform_superadmin() from public, anon, authenticated;
revoke all on function private.require_platform_superadmin() from public, anon, authenticated;
revoke all on function private.platform_audit(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function private.create_club_account() from public, anon, authenticated;
revoke all on function private.audit_platform_roles() from public, anon, authenticated;
revoke all on function private.record_platform_commission() from public, anon, authenticated;
revoke all on function private.sync_platform_commission_verification() from public, anon, authenticated;

alter function public.get_platform_access() owner to postgres;
alter function public.platform_list_clubs() owner to postgres;
alter function public.platform_commission_ledger(uuid, integer) owner to postgres;
alter function public.platform_provision_club(text, text, text, text, text, text, numeric, integer) owner to postgres;
alter function public.platform_set_club_status(uuid, text) owner to postgres;
alter function public.platform_set_commission_rate(uuid, numeric) owner to postgres;
alter function public.platform_assign_club_admin(uuid, text) owner to postgres;
alter function public.platform_revoke_club_admin(uuid, uuid) owner to postgres;
alter function public.platform_recent_actions(integer) owner to postgres;
alter function public.platform_club_admins(uuid) owner to postgres;
revoke all on function public.platform_club_admins(uuid) from public, anon;
grant execute on function public.platform_club_admins(uuid) to authenticated;
revoke all on function public.get_platform_access() from public, anon;
revoke all on function public.platform_list_clubs() from public, anon;
revoke all on function public.platform_commission_ledger(uuid, integer) from public, anon;
revoke all on function public.platform_provision_club(text, text, text, text, text, text, numeric, integer) from public, anon;
revoke all on function public.platform_set_club_status(uuid, text) from public, anon;
revoke all on function public.platform_set_commission_rate(uuid, numeric) from public, anon;
revoke all on function public.platform_assign_club_admin(uuid, text) from public, anon;
revoke all on function public.platform_revoke_club_admin(uuid, uuid) from public, anon;
revoke all on function public.platform_recent_actions(integer) from public, anon;
grant execute on function public.get_platform_access() to authenticated;
grant execute on function public.platform_list_clubs() to authenticated;
grant execute on function public.platform_commission_ledger(uuid, integer) to authenticated;
grant execute on function public.platform_provision_club(text, text, text, text, text, text, numeric, integer) to authenticated;
grant execute on function public.platform_set_club_status(uuid, text) to authenticated;
grant execute on function public.platform_set_commission_rate(uuid, numeric) to authenticated;
grant execute on function public.platform_assign_club_admin(uuid, text) to authenticated;
grant execute on function public.platform_revoke_club_admin(uuid, uuid) to authenticated;
grant execute on function public.platform_recent_actions(integer) to authenticated;
