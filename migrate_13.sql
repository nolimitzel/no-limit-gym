-- ===========================================================================
-- NO LIMIT 2.0 - SUPPLEMENT CHECK-OFFS (run once; safe to re-run).
-- Stores which supplements a user ticked each day alongside that day's food
-- log, so supplement consistency syncs across devices and appears in the
-- weekly report. Your foods, meals and stack live in your (private) programme.
-- Existing rows/policies are unchanged: nutrition_logs is already owner-only.
-- ===========================================================================
alter table public.nutrition_logs add column if not exists supps jsonb;
