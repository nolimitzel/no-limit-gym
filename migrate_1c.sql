-- NO LIMIT 2.0 — slice 1c add-on (run once in Supabase SQL Editor).
-- Adds the app's stable slug keys so cloud workouts round-trip losslessly.
alter table public.workout_sessions add column if not exists session_key text;
alter table public.workout_sets     add column if not exists exercise_key text;
