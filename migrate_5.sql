-- ===========================================================================
-- NO LIMIT 2.0 — Phase 5: SOCIAL (activity feed + reactions). Run once.
-- Squad members see each other's activity; outsiders see nothing.
-- ===========================================================================

create table if not exists public.activity_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  squad_id   uuid not null references public.squads(id) on delete cascade,
  type       text not null,                 -- 'workout' | 'pr' | 'streak'
  data       jsonb,                          -- { title, subtitle, ... }
  created_at timestamptz default now()
);
create index if not exists idx_ap_squad on public.activity_posts(squad_id, created_at desc);

create table if not exists public.activity_reactions (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.activity_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz default now(),
  unique (post_id, user_id, emoji)
);
create index if not exists idx_ar_post on public.activity_reactions(post_id);

-- helper: is a post inside one of my squads? (security definer → no recursion)
create or replace function public.post_in_my_squad(pid uuid) returns boolean
  language sql security definer set search_path=public stable as $$
  select exists(
    select 1 from public.activity_posts p
    where p.id=pid and public.is_squad_member(p.squad_id, auth.uid())); $$;

alter table public.activity_posts     enable row level security;
alter table public.activity_reactions enable row level security;

drop policy if exists "ap_select" on public.activity_posts;
create policy "ap_select" on public.activity_posts for select
  using (public.is_squad_member(squad_id, auth.uid()));
drop policy if exists "ap_insert" on public.activity_posts;
create policy "ap_insert" on public.activity_posts for insert
  with check (user_id=auth.uid() and public.is_squad_member(squad_id, auth.uid()));
drop policy if exists "ap_delete" on public.activity_posts;
create policy "ap_delete" on public.activity_posts for delete using (user_id=auth.uid());

drop policy if exists "ar_select" on public.activity_reactions;
create policy "ar_select" on public.activity_reactions for select using (public.post_in_my_squad(post_id));
drop policy if exists "ar_insert" on public.activity_reactions;
create policy "ar_insert" on public.activity_reactions for insert
  with check (user_id=auth.uid() and public.post_in_my_squad(post_id));
drop policy if exists "ar_delete" on public.activity_reactions;
create policy "ar_delete" on public.activity_reactions for delete using (user_id=auth.uid());
