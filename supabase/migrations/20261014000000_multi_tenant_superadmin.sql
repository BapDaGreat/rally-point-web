-- Multi-Tenant SaaS Branch Architecture & Superadmin Commission System
-- Migration: 20261014000000_multi_tenant_superadmin.sql
-- Enables dividing Rally Point into branch websites overseen by a Superadmin with commission revenue tracking.

-- 1. Add 'superadmin' to user_role enum
alter type public.user_role add value if not exists 'superadmin';

-- 2. Create branches table
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (char_length(slug) between 2 and 50),
  city text not null,
  address text not null,
  commission_rate numeric(5, 2) not null default 5.00 check (commission_rate >= 0 and commission_rate <= 100),
  status text not null default 'active' check (status in ('active', 'suspended', 'provisioning')),
  contact_email text not null,
  contact_phone text not null,
  created_at timestamptz not null default now()
);

-- Seed initial branches so existing records can bind to a default branch
insert into public.branches (id, name, slug, city, address, commission_rate, status, contact_email, contact_phone)
values 
  ('a0000000-0000-0000-0000-000000000001', 'General Santos City (Main)', 'gensan-main', 'General Santos City', 'J. Catolico Ave, Lagao, General Santos City, 9500', 5.00, 'active', 'support.gensan@rallypoint.ph', '0917-111-2222'),
  ('a0000000-0000-0000-0000-000000000002', 'Davao City Hub', 'davao-hub', 'Davao City', 'Ecoland Phase 2, Davao City, 8000', 6.00, 'active', 'support.davao@rallypoint.ph', '0917-333-4444')
on conflict (slug) do nothing;

-- 3. Add branch_id references to core tables
alter table public.profiles
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table public.members
  add column if not exists branch_id uuid references public.branches(id) on delete set null default 'a0000000-0000-0000-0000-000000000001';

alter table public.courts
  add column if not exists branch_id uuid references public.branches(id) on delete cascade default 'a0000000-0000-0000-0000-000000000001';

alter table public.court_sessions
  add column if not exists branch_id uuid references public.branches(id) on delete cascade default 'a0000000-0000-0000-0000-000000000001';

alter table public.transactions
  add column if not exists branch_id uuid references public.branches(id) on delete cascade default 'a0000000-0000-0000-0000-000000000001';

alter table public.support_inquiries
  add column if not exists branch_id uuid references public.branches(id) on delete set null default 'a0000000-0000-0000-0000-000000000001';

-- 4. Create platform_commissions ledger for Superadmin revenue
create table if not exists public.platform_commissions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  booking_id uuid references public.court_sessions(id) on delete set null,
  booking_amount numeric(10, 2) not null check (booking_amount >= 0),
  commission_rate numeric(5, 2) not null check (commission_rate >= 0),
  commission_amount numeric(10, 2) not null check (commission_amount >= 0),
  branch_net_amount numeric(10, 2) not null check (branch_net_amount >= 0),
  status text not null default 'settled' check (status in ('pending', 'settled', 'refunded')),
  created_at timestamptz not null default now()
);

-- Seed initial commission transactions for auditing
insert into public.platform_commissions (branch_id, booking_amount, commission_rate, commission_amount, branch_net_amount, status)
values
  ('a0000000-0000-0000-0000-000000000001', 700.00, 5.00, 35.00, 665.00, 'settled'),
  ('a0000000-0000-0000-0000-000000000001', 350.00, 5.00, 17.50, 332.50, 'settled'),
  ('a0000000-0000-0000-0000-000000000002', 1050.00, 6.00, 63.00, 987.00, 'settled');

-- 5. Helper function for tenant branch checking
create or replace function private.current_branch_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.branch_id
  from public.profiles as p
  where p.id = (select auth.uid());
$$;

revoke all on function private.current_branch_id() from public;
revoke all on function private.current_branch_id() from anon;
grant execute on function private.current_branch_id() to authenticated;

-- 6. Row Level Security Policies
alter table public.branches enable row level security;
alter table public.platform_commissions enable row level security;

-- Public/Authenticated branch listing
create policy "branches_select_all"
  on public.branches for select to authenticated
  using (true);

-- Superadmin branch creation/updating
create policy "branches_modify_superadmin"
  on public.branches for all to authenticated
  using ((select private.current_role()) = 'superadmin')
  with check ((select private.current_role()) = 'superadmin');

-- Superadmin commissions read
create policy "commissions_select_superadmin"
  on public.platform_commissions for select to authenticated
  using (
    (select private.current_role()) = 'superadmin'
    or branch_id = (select private.current_branch_id())
  );

grant select on public.branches to authenticated;
grant all on public.branches to authenticated;
grant select on public.platform_commissions to authenticated;
