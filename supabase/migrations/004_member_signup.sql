-- Public member join: force profile.role = member, auto-create members row,
-- allow self-insert of own member row as fallback.

-- 1) Signup trigger: always member (staff/admin promoted manually in Dashboard/SQL)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_phone text;
  v_code text;
  v_token text;
begin
  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  v_phone := new.raw_user_meta_data->>'phone';

  insert into public.profiles (id, email, full_name, role, phone)
  values (
    new.id,
    new.email,
    v_name,
    'member', -- never trust client metadata for elevated roles
    nullif(v_phone, '')
  )
  on conflict (id) do nothing;

  -- Auto member record for self-serve join
  v_code := 'RP-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
  v_token := 'q_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

  insert into public.members (
    user_id, member_code, full_name, email, phone,
    membership_type, status, join_date, expiry_date, qr_token
  )
  select
    new.id,
    v_code,
    v_name,
    new.email,
    nullif(v_phone, ''),
    'standard',
    'active',
    current_date,
    current_date + 30,
    v_token
  where not exists (
    select 1 from public.members m where m.user_id = new.id
  );

  return new;
exception
  when unique_violation then
    return new;
end;
$$;

-- 2) Members can insert/update only their own row (client fallback if trigger lags)
drop policy if exists "members_insert_own" on public.members;
create policy "members_insert_own"
  on public.members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.current_role() = 'member'
  );

drop policy if exists "members_update_own" on public.members;
create policy "members_update_own"
  on public.members for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3) Block members from changing their profile.role (only admin can elevate)
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.current_role() = 'admin')
  with check (
    public.current_role() = 'admin'
    or (
      id = auth.uid()
      and role = (select p.role from public.profiles p where p.id = auth.uid())
    )
  );

comment on function public.handle_new_user is
  'Public signup creates member profile + members row. Promote staff/admin manually.';
