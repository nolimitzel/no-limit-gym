-- ===========================================================================
-- NO LIMIT 2.0 — Phase 8: MUSIC (run once).
-- A shared "training soundtrack" per member — a playlist link + vibe label,
-- stored on the profile. Squad-mates already have read access to profiles
-- (shares_squad), and each user updates their own, so no new policies needed.
-- Sharing is opt-in: a link only appears once you set one, and turning the
-- Music privacy toggle off clears it.
-- ===========================================================================
alter table public.profiles add column if not exists music_url   text;
alter table public.profiles add column if not exists music_label text;
