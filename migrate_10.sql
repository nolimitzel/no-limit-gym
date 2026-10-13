-- ===========================================================================
-- NO LIMIT 2.0 — Phase: CUSTOM EXERCISE LIBRARY (run once).
-- Each user's own exercises, saved permanently and categorised by muscle group
-- so they can be reused in any future session. Separate from workout history.
-- `key` is a stable per-exercise id so logged history stays linked to it.
-- ===========================================================================
create table if not exists public.custom_exercises (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  key          text not null,                 -- stable id, referenced by workout history
  name         text not null,
  muscle_group text not null,                 -- Chest / Back / Shoulders / Legs / Biceps / Triceps / Core / Cardio
  equipment    text,
  sets         int  default 3,
  reps         text default '10-12',
  created_at   timestamptz default now(),
  unique (user_id, key)
);
create index if not exists idx_customex_user on public.custom_exercises(user_id);

alter table public.custom_exercises enable row level security;

drop policy if exists "cx_all_own" on public.custom_exercises;
create policy "cx_all_own" on public.custom_exercises
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
