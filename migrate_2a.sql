-- NO LIMIT 2.0 — Phase 2a (run once in Supabase SQL Editor).
-- Stores each user's editable programme as a JSON document on their programme row.
-- (Until this runs, the editor still works locally; this adds cross-device cloud sync.)
alter table public.programmes add column if not exists data jsonb;
