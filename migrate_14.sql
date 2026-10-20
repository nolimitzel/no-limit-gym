-- ===========================================================================
-- NO LIMIT 2.0 - ONE SQUAD POST PER WORKOUT (run once; safe to re-run).
-- The app now posts each workout to the squad automatically and retries until
-- the server confirms it. This makes a duplicate impossible at the database
-- level (two devices posting the same workout at the same moment, or a retry
-- racing a slow confirmation): a second post for the same squad + person +
-- workout day + workout is rejected, and the app treats that as "already posted".
--
-- Only posts written by the new app carry data.date + data.key, so older posts
-- are untouched (partial index). Step 1 is a safety net: if any exact duplicate
-- of a new-style post exists, keep the earliest and remove the extra copy (it
-- normally matches nothing). Small table: the index builds in milliseconds.
-- ===========================================================================
delete from public.activity_posts a
using public.activity_posts b
where a.type = 'workout' and b.type = 'workout'
  and a.data ? 'date' and a.data ? 'key'
  and a.squad_id = b.squad_id and a.user_id = b.user_id
  and a.data->>'date' = b.data->>'date' and a.data->>'key' = b.data->>'key'
  and (a.created_at, a.id::text) > (b.created_at, b.id::text);

create unique index if not exists activity_posts_one_per_workout
  on public.activity_posts (squad_id, user_id, (data->>'date'), (data->>'key'))
  where type = 'workout' and data ? 'date' and data ? 'key';
