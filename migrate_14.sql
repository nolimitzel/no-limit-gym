-- ===========================================================================
-- NO LIMIT 2.0 - ONE SQUAD POST PER WORKOUT (run once; safe to re-run).
-- The app now posts each workout to the squad automatically and retries until
-- the server confirms it. This makes a duplicate impossible at the database
-- level (two devices posting the same workout at the same moment, or a retry
-- racing a slow confirmation): a second post for the same squad + person +
-- workout day + workout is rejected, and the app treats that as "already posted".
--
-- Only posts written by the new app carry data.date + data.key, so older posts
-- are untouched (partial index), and nothing existing can conflict with it.
-- Small table: a plain (non-concurrent) index build takes milliseconds.
-- ===========================================================================
create unique index if not exists activity_posts_one_per_workout
  on public.activity_posts (squad_id, user_id, (data->>'date'), (data->>'key'))
  where type = 'workout' and data ? 'date' and data ? 'key';
