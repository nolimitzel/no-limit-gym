-- ===========================================================================
-- NO LIMIT 2.0 — AUDIT FIXES (run once; safe to re-run). See AUDIT_REPORT.md.
-- Non-destructive: no rows are deleted. Every client change works both before
-- and after this runs.
-- ===========================================================================

-- ---------- H3: squad-mates must not read private profile fields ----------
-- RLS is row-level, so a squad-mate could read the WHOLE profile row (email,
-- bodyweight, goal, experience, training days). Restrict which COLUMNS other
-- users can select; the owner reads their full row via get_my_profile().
alter table public.profiles add column if not exists privacy jsonb;   -- M1: owner-only
revoke select on public.profiles from anon, authenticated;
grant select (id, username, name, avatar_url, music_url, music_label, created_at)
  on public.profiles to authenticated;

create or replace function public.get_my_profile() returns public.profiles
  language sql security definer set search_path = public stable as $$
  select * from public.profiles where id = auth.uid();
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- ---------- H4: sign-up must not fail on a blank or taken username ----------
-- coalesce() treated '' as a real username, so the 2nd blank sign-up (or any
-- clash, e.g. john@gmail vs john@yahoo) violated UNIQUE and aborted sign-up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text; cand text; n int := 0;
begin
  base := regexp_replace(
    coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1)),
    '[^A-Za-z0-9_]', '', 'g');
  if base is null or base = '' then base := 'athlete'; end if;
  cand := base;
  while exists (select 1 from public.profiles where username = cand) loop
    n := n + 1;
    cand := base || n::text;
  end loop;
  insert into public.profiles (id, email, username, name)
  values (new.id, new.email, cand, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- M12: joining a squad must go through the invite code ----------
-- The direct-insert policy let any user add themselves to any squad whose id
-- they knew (incl. one they were removed from). create_squad / join_squad are
-- SECURITY DEFINER, so the app never needs a direct insert.
drop policy if exists "sm_insert" on public.squad_members;

-- ---------- C3: exactly one active programme per user ----------
alter table public.programmes add column if not exists updated_at timestamptz default now();
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists programmes_touch on public.programmes;
create trigger programmes_touch before update on public.programmes
  for each row execute function public.touch_updated_at();
-- keep the row the app already reads (oldest active); deactivate — not delete — any duplicates
update public.programmes p set is_active = false
where p.is_active and exists (
  select 1 from public.programmes q
  where q.user_id = p.user_id and q.is_active and (q.created_at, q.id) < (p.created_at, p.id));
create unique index if not exists programmes_one_active on public.programmes (user_id) where is_active;

-- ---------- C1: meals sync across devices ----------
alter table public.nutrition_logs add column if not exists meals jsonb;
