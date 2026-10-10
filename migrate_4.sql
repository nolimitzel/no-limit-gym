-- ===========================================================================
-- NO LIMIT 2.0 — Phase 4: SQUADS (run once in Supabase SQL Editor).
-- Members can see their squad + each other; outsiders see nothing.
-- SECURITY DEFINER helpers avoid RLS recursion on squad_members.
-- ===========================================================================

create table if not exists public.squads (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  invite_code text unique,
  created_at  timestamptz default now()
);

create table if not exists public.squad_members (
  id        uuid primary key default gen_random_uuid(),
  squad_id  uuid not null references public.squads(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,  -- embeds profiles
  role      text default 'member',
  joined_at timestamptz default now(),
  unique (squad_id, user_id)
);
create index if not exists idx_sm_squad on public.squad_members(squad_id);
create index if not exists idx_sm_user  on public.squad_members(user_id);

-- ---------- helpers (bypass RLS to prevent recursion) ----------
create or replace function public.is_squad_member(sid uuid, uid uuid) returns boolean
  language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.squad_members where squad_id=sid and user_id=uid); $$;

create or replace function public.is_squad_owner(sid uuid, uid uuid) returns boolean
  language sql security definer set search_path=public stable as $$
  select exists(select 1 from public.squads where id=sid and owner_id=uid); $$;

create or replace function public.shares_squad(a uuid, b uuid) returns boolean
  language sql security definer set search_path=public stable as $$
  select exists(
    select 1 from public.squad_members m1
    join public.squad_members m2 on m1.squad_id=m2.squad_id
    where m1.user_id=a and m2.user_id=b); $$;

-- ---------- RLS ----------
alter table public.squads        enable row level security;
alter table public.squad_members enable row level security;

drop policy if exists "squads_select" on public.squads;
create policy "squads_select" on public.squads for select
  using (owner_id=auth.uid() or public.is_squad_member(id, auth.uid()));
drop policy if exists "squads_insert" on public.squads;
create policy "squads_insert" on public.squads for insert with check (owner_id=auth.uid());
drop policy if exists "squads_modify" on public.squads;
create policy "squads_modify" on public.squads for update using (owner_id=auth.uid()) with check (owner_id=auth.uid());
drop policy if exists "squads_delete" on public.squads;
create policy "squads_delete" on public.squads for delete using (owner_id=auth.uid());

drop policy if exists "sm_select" on public.squad_members;
create policy "sm_select" on public.squad_members for select using (public.is_squad_member(squad_id, auth.uid()));
drop policy if exists "sm_insert" on public.squad_members;
create policy "sm_insert" on public.squad_members for insert with check (user_id=auth.uid());
drop policy if exists "sm_delete" on public.squad_members;
create policy "sm_delete" on public.squad_members for delete
  using (user_id=auth.uid() or public.is_squad_owner(squad_id, auth.uid()));

-- profiles: members can read each other's profile (self + writes stay own-only)
drop policy if exists "own profile"     on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (id=auth.uid() or public.shares_squad(auth.uid(), id));
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert with check (id=auth.uid());
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());

-- ---------- RPCs (create/join bypass the chicken-and-egg of SELECT-before-join) ----------
create or replace function public.create_squad(squad_name text, code text) returns uuid
  language plpgsql security definer set search_path=public as $$
  declare sid uuid;
  begin
    insert into public.squads(name, owner_id, invite_code)
      values (squad_name, auth.uid(), upper(code)) returning id into sid;
    insert into public.squad_members(squad_id, user_id, role) values (sid, auth.uid(), 'owner');
    return sid;
  end $$;

create or replace function public.join_squad(code text) returns uuid
  language plpgsql security definer set search_path=public as $$
  declare sid uuid;
  begin
    select id into sid from public.squads where invite_code=upper(code);
    if sid is null then raise exception 'Invalid invite code'; end if;
    insert into public.squad_members(squad_id, user_id, role)
      values (sid, auth.uid(), 'member') on conflict (squad_id, user_id) do nothing;
    return sid;
  end $$;
