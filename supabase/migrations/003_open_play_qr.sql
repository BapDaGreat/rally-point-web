-- P1/P2: open play, QR tokens, reminders scaffold

alter table public.members add column if not exists qr_token text;

do $$ begin
  create type public.open_play_status as enum ('open', 'full', 'cancelled', 'completed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.open_play_signup_status as enum ('joined', 'waitlist', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.skill_level as enum ('all', 'beginner', 'intermediate', 'advanced');
exception when duplicate_object then null;
end $$;

create table if not exists public.open_plays (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  court_id uuid references public.courts (id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity int not null default 8 check (capacity > 0),
  fee numeric(12,2) not null default 0,
  skill_level public.skill_level not null default 'all',
  status public.open_play_status not null default 'open',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.open_play_signups (
  id uuid primary key default gen_random_uuid(),
  open_play_id uuid not null references public.open_plays (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  status public.open_play_signup_status not null default 'joined',
  created_at timestamptz not null default now(),
  unique (open_play_id, member_id)
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  fire_at timestamptz not null,
  sent_at timestamptz,
  booking_id uuid references public.bookings (id) on delete set null,
  open_play_id uuid references public.open_plays (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists open_plays_start_idx on public.open_plays (start_at);
create index if not exists reminders_fire_idx on public.reminders (fire_at) where sent_at is null;

alter table public.open_plays enable row level security;
alter table public.open_play_signups enable row level security;
alter table public.reminders enable row level security;

drop policy if exists "open_plays_read_all_auth" on public.open_plays;
create policy "open_plays_read_all_auth" on public.open_plays for select to authenticated using (true);

drop policy if exists "open_plays_write_staff" on public.open_plays;
create policy "open_plays_write_staff" on public.open_plays for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin'))
);

drop policy if exists "open_play_signups_read" on public.open_play_signups;
create policy "open_play_signups_read" on public.open_play_signups for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin'))
  or exists (select 1 from public.members m where m.id = member_id and m.user_id = auth.uid())
);

drop policy if exists "open_play_signups_insert" on public.open_play_signups;
create policy "open_play_signups_insert" on public.open_play_signups for insert with check (
  exists (select 1 from public.members m where m.id = member_id and m.user_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin'))
);

drop policy if exists "open_play_signups_update" on public.open_play_signups;
create policy "open_play_signups_update" on public.open_play_signups for update using (
  exists (select 1 from public.members m where m.id = member_id and m.user_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin'))
);

drop policy if exists "reminders_own" on public.reminders;
create policy "reminders_own" on public.reminders for select using (user_id = auth.uid());
