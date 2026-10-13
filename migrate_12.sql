-- ===========================================================================
-- NO LIMIT 2.0 — PHOTO GALLERY (run once; safe to re-run).
-- Progress / flex photos that disappear after 4 weeks.
--   • Files live in a PRIVATE "photos" bucket under <uid>/… — never public URLs;
--     the app shows them through short-lived signed links.
--   • Each photo is Private (only you) or Squad (people who share a squad with you).
--   • created_at / expires_at are set by the database (28 days), not the phone,
--     and can't be edited afterwards — nobody can make a photo live longer.
--   • Expired photos are hidden everywhere immediately; their files are deleted by
--     the owner's app on next open (Storage files can't be deleted from SQL).
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do update set public = false;

create table if not exists public.progress_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path        text not null unique,
  kind        text not null default 'progress' check (kind in ('progress', 'flex')),
  visibility  text not null default 'private' check (visibility in ('private', 'squad')),
  caption     text check (caption is null or char_length(caption) <= 140),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '28 days'
);
create index if not exists progress_photos_user_idx on public.progress_photos (user_id, created_at desc);

-- the database owns the clock: 28 days from upload, whatever the client sends
create or replace function public.photos_stamp() returns trigger language plpgsql as $$
begin
  new.created_at := now();
  new.expires_at := now() + interval '28 days';
  return new;
end $$;
drop trigger if exists photos_stamp on public.progress_photos;
create trigger photos_stamp before insert on public.progress_photos
  for each row execute function public.photos_stamp();

alter table public.progress_photos enable row level security;

drop policy if exists "pp_select_own" on public.progress_photos;
create policy "pp_select_own" on public.progress_photos for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "pp_select_squad" on public.progress_photos;
create policy "pp_select_squad" on public.progress_photos for select to authenticated
  using (visibility = 'squad' and expires_at > now() and public.shares_squad(auth.uid(), user_id));

drop policy if exists "pp_insert_own" on public.progress_photos;
create policy "pp_insert_own" on public.progress_photos for insert to authenticated
  with check (user_id = auth.uid() and (storage.foldername(path))[1] = auth.uid()::text);

drop policy if exists "pp_update_own" on public.progress_photos;
create policy "pp_update_own" on public.progress_photos for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "pp_delete_own" on public.progress_photos;
create policy "pp_delete_own" on public.progress_photos for delete to authenticated
  using (user_id = auth.uid());

-- only visibility and caption can change after upload
revoke update on public.progress_photos from anon, authenticated;
grant update (visibility, caption) on public.progress_photos to authenticated;
grant select, insert, delete on public.progress_photos to authenticated;

-- ---------- storage policies for the private bucket ----------
drop policy if exists "photos_insert_own" on storage.objects;
create policy "photos_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos_delete_own" on storage.objects;
create policy "photos_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- read: your own files, or a file whose photo row you're allowed to see and that
-- hasn't expired (the subquery runs under progress_photos' own RLS above)
drop policy if exists "photos_read" on storage.objects;
create policy "photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.progress_photos p
               where p.path = storage.objects.name and p.expires_at > now())
  ));
