-- Custom emoji, Slack style: any league member uploads a small image, names it
-- (:bills_mafia:) and everyone in that league can react with it. The image
-- lives in a public "emoji" bucket under the league's folder. The uploader or
-- the commissioner can remove one. Reactions store custom emoji as ":name:".
-- is_member() is from 0001 and is_commissioner() from 0004. Safe to run more
-- than once. Run after 0028 in the Supabase SQL editor.

create table if not exists league_emoji (
  league_id uuid not null references leagues (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_-]{2,24}$'),
  image_url text not null check (image_url like '%/storage/v1/object/public/emoji/%'),
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (league_id, name)
);

alter table league_emoji enable row level security;

drop policy if exists "members read league emoji" on league_emoji;
create policy "members read league emoji" on league_emoji
  for select to authenticated using (is_member(league_id));

drop policy if exists "members add league emoji" on league_emoji;
create policy "members add league emoji" on league_emoji
  for insert to authenticated
  with check (created_by = auth.uid() and is_member(league_id));

drop policy if exists "uploader or commissioner removes emoji" on league_emoji;
create policy "uploader or commissioner removes emoji" on league_emoji
  for delete to authenticated
  using (created_by = auth.uid() or is_commissioner(league_id));

-- ":name:" is longer than the 16 characters 0028 allowed for a reaction.
alter table comment_reactions drop constraint if exists comment_reactions_emoji_check;
alter table comment_reactions add constraint comment_reactions_emoji_check
  check (char_length(emoji) between 1 and 40);

-- Images: public to read, small, one folder per league.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('emoji', 'emoji', true, 524288, array['image/webp', 'image/png', 'image/gif', 'image/jpeg'])
on conflict (id) do nothing;

-- The folder name is the league id; anything that isn't a uuid is refused.
create or replace function emoji_folder_league(p_name text) returns uuid
language sql stable as $$
  select case
    when (storage.foldername(p_name))[1] ~ '^[0-9a-f-]{36}$'
    then (storage.foldername(p_name))[1]::uuid
  end
$$;

-- Removing a file goes through a lookup, which needs read access too.
drop policy if exists "members list league emoji" on storage.objects;
create policy "members list league emoji" on storage.objects
  for select to authenticated
  using (bucket_id = 'emoji' and is_member(emoji_folder_league(name)));

drop policy if exists "members upload league emoji" on storage.objects;
create policy "members upload league emoji" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'emoji' and is_member(emoji_folder_league(name)));

drop policy if exists "uploader or commissioner deletes emoji image" on storage.objects;
create policy "uploader or commissioner deletes emoji image" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'emoji'
    and (owner = auth.uid() or is_commissioner(emoji_folder_league(name)))
  );
