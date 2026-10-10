-- ===========================================================================
-- NO LIMIT 2.0 — Phase 1 schema (run in Supabase: SQL Editor → New query → Run)
-- Safe to re-run. Owner-only Row-Level Security on every table.
-- Principle: PROGRAMME data is editable; HISTORY data is immutable
-- (workout_sets snapshot the exercise name so editing a plan never
--  rewrites past sessions). Child rows carry user_id for fast, direct RLS.
-- ===========================================================================

-- ---------- PROFILES (1:1 with auth.users) ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique,
  name          text,
  avatar_url    text,
  email         text,
  goal          text,            -- e.g. 'lean_gain' | 'fat_loss' | 'strength'
  experience    text,            -- 'beginner' | 'intermediate' | 'advanced'
  bw_current    numeric,
  bw_target     numeric,
  height        numeric,
  training_days text[],          -- e.g. '{Mon,Tue,Wed,Fri,Sat}'
  created_at    timestamptz default now()
);

-- ---------- NUTRITION TARGETS (1:1 with user) ----------
create table if not exists public.nutrition_targets (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  kcal     int, protein int, carbs int, fats int, water int
);

-- ---------- EXERCISE LIBRARY (global rows have owner_id = null) ----------
create table if not exists public.exercises (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users(id) on delete cascade, -- null = public/global
  name         text not null,
  muscle_group text,
  equipment    text,
  instructions text,
  media_url    text,
  default_sets int,
  rep_range    text,
  is_public    boolean default false,
  created_at   timestamptz default now()
);

-- ---------- PROGRAMMES (editable, current) ----------
create table if not exists public.programmes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  is_active  boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.programme_days (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  programme_id uuid not null references public.programmes(id) on delete cascade,
  weekday      int,              -- 0=Mon … 6=Sun (null if not day-pinned)
  name         text,             -- 'Push', 'Upper', etc.
  is_rest      boolean default false,
  sort         int default 0
);

create table if not exists public.programme_exercises (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  programme_day_id uuid not null references public.programme_days(id) on delete cascade,
  exercise_id      uuid references public.exercises(id) on delete set null,
  sort             int default 0,
  target_sets      int,
  rep_min          int,
  rep_max          int,
  target_weight    numeric,
  rest_sec         int,
  notes            text
);

-- ---------- WORKOUT HISTORY (immutable facts) ----------
create table if not exists public.workout_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  programme_day_id uuid references public.programme_days(id) on delete set null,
  date             date not null,
  label_snapshot   text,         -- session name at the time (e.g. 'Push')
  started_at       timestamptz default now(),
  completed_at     timestamptz,
  notes            text
);

create table if not exists public.workout_sets (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  session_id            uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id           uuid references public.exercises(id) on delete set null,
  exercise_name_snapshot text,   -- preserves history if the exercise is renamed/deleted
  set_index             int,
  weight                numeric,
  reps                  int,
  is_cardio             boolean default false,
  minutes               int,     -- cardio only
  rounds                int      -- cardio only
);

-- ---------- BODYWEIGHT + NUTRITION LOGS ----------
create table if not exists public.bodyweight_logs (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date    date not null,
  weight  numeric not null,
  unique (user_id, date)
);

create table if not exists public.nutrition_logs (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date    date not null,
  kcal int, protein int, carbs int, fats int, water int,
  unique (user_id, date)
);

-- ---------- INDEXES ----------
create index if not exists idx_sessions_user_date on public.workout_sessions(user_id, date desc);
create index if not exists idx_sets_session        on public.workout_sets(session_id);
create index if not exists idx_sets_user_ex         on public.workout_sets(user_id, exercise_id);
create index if not exists idx_bw_user_date         on public.bodyweight_logs(user_id, date desc);
create index if not exists idx_nut_user_date        on public.nutrition_logs(user_id, date desc);
create index if not exists idx_pdays_programme      on public.programme_days(programme_id);
create index if not exists idx_pex_day              on public.programme_exercises(programme_day_id);

-- ===========================================================================
-- ROW-LEVEL SECURITY — deny by default, then allow owner only.
-- ===========================================================================
alter table public.profiles            enable row level security;
alter table public.nutrition_targets   enable row level security;
alter table public.exercises           enable row level security;
alter table public.programmes          enable row level security;
alter table public.programme_days      enable row level security;
alter table public.programme_exercises enable row level security;
alter table public.workout_sessions    enable row level security;
alter table public.workout_sets        enable row level security;
alter table public.bodyweight_logs     enable row level security;
alter table public.nutrition_logs      enable row level security;

-- profiles: owner full control (id = auth.uid())
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- generic owner-only tables (user_id = auth.uid())
do $$
declare t text;
begin
  foreach t in array array[
    'nutrition_targets','programmes','programme_days','programme_exercises',
    'workout_sessions','workout_sets','bodyweight_logs','nutrition_logs'
  ] loop
    execute format('drop policy if exists "owner all" on public.%I;', t);
    execute format(
      'create policy "owner all" on public.%I for all
         using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
  end loop;
end $$;

-- exercises: read if public OR owned; write only if owned
drop policy if exists "read public or own" on public.exercises;
create policy "read public or own" on public.exercises
  for select using (is_public = true or owner_id = auth.uid());
drop policy if exists "write own exercises" on public.exercises;
create policy "write own exercises" on public.exercises
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ===========================================================================
-- AUTO-CREATE a profile row when a new user signs up.
-- Username/name come from auth metadata if provided at sign-up.
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'name', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Done. Every table is RLS-protected: a user can only ever read/write their own
-- rows (exercises additionally allow reading rows explicitly marked public).
