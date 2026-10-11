-- ===========================================================================
-- NO LIMIT 2.0 — Phase 7: ACCOUNTABILITY (run once).
-- Weekly commitments: each member pledges a training target for the week;
-- squad-mates can see each other's commitments to stay accountable.
-- ===========================================================================
create table if not exists public.commitments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  squad_id   uuid references public.squads(id) on delete set null,
  week_start date not null,                 -- Monday of the week (YYYY-MM-DD)
  target     int  not null,                 -- sessions pledged this week
  created_at timestamptz default now(),
  unique (user_id, week_start)
);
create index if not exists idx_commit_squad on public.commitments(squad_id, week_start);

alter table public.commitments enable row level security;

-- own rows: full control
drop policy if exists "cm_select_own" on public.commitments;
create policy "cm_select_own" on public.commitments for select using (user_id = auth.uid());
drop policy if exists "cm_insert" on public.commitments;
create policy "cm_insert" on public.commitments for insert with check (user_id = auth.uid());
drop policy if exists "cm_update" on public.commitments;
create policy "cm_update" on public.commitments for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "cm_delete" on public.commitments;
create policy "cm_delete" on public.commitments for delete using (user_id = auth.uid());

-- squad-mates can read each other's commitments (accountability board)
drop policy if exists "cm_select_squad" on public.commitments;
create policy "cm_select_squad" on public.commitments for select
  using (squad_id is not null and public.is_squad_member(squad_id, auth.uid()));
