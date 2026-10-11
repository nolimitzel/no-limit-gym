-- ===========================================================================
-- NO LIMIT 2.0 — Phase 6: CHALLENGES (run once). Squad-combined goals.
-- ===========================================================================
create table if not exists public.challenges (
  id         uuid primary key default gen_random_uuid(),
  squad_id   uuid not null references public.squads(id) on delete cascade,
  title      text not null,
  target     int  not null,                 -- e.g. 20 (combined workouts)
  metric     text default 'workouts',
  starts_on  timestamptz default now(),
  ends_on    timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);
create index if not exists idx_ch_squad on public.challenges(squad_id, created_at desc);

alter table public.challenges enable row level security;

drop policy if exists "ch_select" on public.challenges;
create policy "ch_select" on public.challenges for select using (public.is_squad_member(squad_id, auth.uid()));
drop policy if exists "ch_insert" on public.challenges;
create policy "ch_insert" on public.challenges for insert
  with check (public.is_squad_member(squad_id, auth.uid()) and created_by = auth.uid());
drop policy if exists "ch_delete" on public.challenges;
create policy "ch_delete" on public.challenges for delete
  using (created_by = auth.uid() or public.is_squad_owner(squad_id, auth.uid()));
