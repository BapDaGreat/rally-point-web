-- P0: online bookings + payment fields

do $$ begin
  alter type public.session_status add value if not exists 'pending_payment';
exception when others then null;
end $$;

do $$ begin
  alter type public.tx_type add value if not exists 'booking';
exception when others then null;
end $$;

do $$ begin
  create type public.booking_status as enum (
    'pending_payment',
    'confirmed',
    'cancelled',
    'completed',
    'no_show'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum ('gcash', 'maya', 'card', 'demo_wallet');
exception when duplicate_object then null;
end $$;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  hours int not null check (hours between 1 and 3),
  amount numeric(12,2) not null default 0,
  status public.booking_status not null default 'pending_payment',
  payment_method public.payment_method,
  payment_ref text,
  session_id uuid references public.court_sessions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists bookings_court_time_idx on public.bookings (court_id, start_at, end_at);
create index if not exists bookings_member_idx on public.bookings (member_id, start_at desc);

alter table public.court_sessions
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

alter table public.bookings enable row level security;

drop policy if exists "bookings_select_own_or_staff" on public.bookings;
create policy "bookings_select_own_or_staff"
  on public.bookings for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('staff', 'admin')
    )
    or exists (
      select 1 from public.members m
      where m.id = bookings.member_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own"
  on public.bookings for insert
  with check (
    exists (
      select 1 from public.members m
      where m.id = member_id and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('staff', 'admin')
    )
  );

drop policy if exists "bookings_update_own_or_staff" on public.bookings;
create policy "bookings_update_own_or_staff"
  on public.bookings for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('staff', 'admin')
    )
    or exists (
      select 1 from public.members m
      where m.id = bookings.member_id and m.user_id = auth.uid()
    )
  );
