-- Rally Point schema for Supabase
-- Run in SQL Editor (or supabase db push)

create extension if not exists "pgcrypto";

create type public.user_role as enum ('member', 'staff', 'admin');
create type public.membership_type as enum ('basic', 'standard', 'premium');
create type public.member_status as enum ('active', 'expired', 'pending', 'suspended');
create type public.session_status as enum ('scheduled', 'playing', 'completed', 'cancelled');
create type public.tx_type as enum ('membership', 'court_rental', 'walk_in', 'extension', 'other');
create type public.court_status as enum ('available', 'occupied', 'maintenance');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.user_role not null default 'member',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  member_code text not null unique,
  full_name text not null,
  email text,
  phone text,
  membership_type public.membership_type not null default 'standard',
  status public.member_status not null default 'active',
  join_date date not null default current_date,
  expiry_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status public.court_status not null default 'available',
  hourly_rate numeric(12,2) not null default 500
);

create table public.court_sessions (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts (id) on delete cascade,
  member_id uuid references public.members (id) on delete set null,
  guest_name text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.session_status not null default 'scheduled',
  amount numeric(12,2) not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  staff_id uuid references public.profiles (id) on delete set null,
  note text
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members (id) on delete set null,
  amount numeric(12,2) not null,
  type public.tx_type not null default 'other',
  description text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.walkins (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  purpose text not null,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null
);

-- Auto profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, phone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'member'),
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.members enable row level security;
alter table public.courts enable row level security;
alter table public.court_sessions enable row level security;
alter table public.checkins enable row level security;
alter table public.transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.walkins enable row level security;

-- Profiles
create policy "profiles_select_own_or_staff"
  on public.profiles for select
  using (
    id = auth.uid()
    or public.current_role() in ('staff', 'admin')
  );

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.current_role() = 'admin');

-- Members
create policy "members_select"
  on public.members for select
  using (
    user_id = auth.uid()
    or public.current_role() in ('staff', 'admin')
  );

create policy "members_write_staff"
  on public.members for all
  using (public.current_role() in ('staff', 'admin'))
  with check (public.current_role() in ('staff', 'admin'));

-- Courts / sessions / checkins / walkins / txns: staff+admin
create policy "courts_read_auth" on public.courts for select to authenticated using (true);
create policy "courts_write_staff" on public.courts for all
  using (public.current_role() in ('staff', 'admin'))
  with check (public.current_role() in ('staff', 'admin'));

create policy "sessions_read" on public.court_sessions for select to authenticated using (
  public.current_role() in ('staff', 'admin')
  or member_id in (select id from public.members where user_id = auth.uid())
);
create policy "sessions_write_staff" on public.court_sessions for all
  using (public.current_role() in ('staff', 'admin'))
  with check (public.current_role() in ('staff', 'admin'));

create policy "checkins_read" on public.checkins for select to authenticated using (
  public.current_role() in ('staff', 'admin')
  or member_id in (select id from public.members where user_id = auth.uid())
);
create policy "checkins_write_staff" on public.checkins for all
  using (public.current_role() in ('staff', 'admin'))
  with check (public.current_role() in ('staff', 'admin'));

create policy "tx_read" on public.transactions for select to authenticated using (
  public.current_role() in ('staff', 'admin')
  or member_id in (select id from public.members where user_id = auth.uid())
);
create policy "tx_write" on public.transactions for insert to authenticated with check (
  public.current_role() in ('staff', 'admin', 'member')
);

create policy "notif_own" on public.notifications for select using (user_id = auth.uid());
create policy "notif_update_own" on public.notifications for update using (user_id = auth.uid());
create policy "notif_insert_staff" on public.notifications for insert with check (
  public.current_role() in ('staff', 'admin', 'member')
);

create policy "walkins_staff" on public.walkins for all
  using (public.current_role() in ('staff', 'admin'))
  with check (public.current_role() in ('staff', 'admin'));

-- Seed courts
insert into public.courts (name, status, hourly_rate) values
  ('Court A', 'available', 500),
  ('Court B', 'available', 500),
  ('Court C', 'available', 650),
  ('Court D', 'available', 650);
