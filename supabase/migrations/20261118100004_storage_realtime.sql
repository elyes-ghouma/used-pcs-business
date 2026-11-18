-- Storage bucket for product photos and the business logo.
-- Size and MIME limits are enforced by the bucket itself, not only by the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets serve files by URL without a SELECT policy; we add none, so nobody can list the bucket.
create policy "site-media admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and (select public.is_admin()));
create policy "site-media admin update" on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and (select public.is_admin()))
  with check (bucket_id = 'site-media' and (select public.is_admin()));
create policy "site-media admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and (select public.is_admin()));
-- The upload client reads the object back after upload; allow admins to select too.
create policy "site-media admin select" on storage.objects for select to authenticated
  using (bucket_id = 'site-media' and (select public.is_admin()));

-- Realtime for the admin inbox (RLS still applies: only admins receive rows).
alter publication supabase_realtime add table public.conversations, public.messages;
