-- Game comments: league members talk about a game, react with emoji and
-- @mention each other (an in-app notification for the person mentioned).
-- Comments are just text, so they never reveal anyone's pick. The author can
-- delete their own comment; the commissioner can delete anyone's.
-- is_member() is from 0001 and is_commissioner() from 0004. Safe to run more
-- than once. Run after 0027 in the Supabase SQL editor.

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id) on delete cascade,
  game_id text not null references games (id),
  author_id uuid not null references profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists comments_league_game on comments (league_id, game_id, created_at);

create table if not exists comment_reactions (
  comment_id uuid not null references comments (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

create table if not exists comment_mentions (
  comment_id uuid not null references comments (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_mentions_user on comment_mentions (user_id, created_at desc);

alter table comments enable row level security;
alter table comment_reactions enable row level security;
alter table comment_mentions enable row level security;

drop policy if exists "members read comments" on comments;
create policy "members read comments" on comments
  for select to authenticated using (is_member(league_id));

drop policy if exists "members post comments" on comments;
create policy "members post comments" on comments
  for insert to authenticated
  with check (author_id = auth.uid() and is_member(league_id));

drop policy if exists "author or commissioner deletes comments" on comments;
create policy "author or commissioner deletes comments" on comments
  for delete to authenticated
  using (author_id = auth.uid() or is_commissioner(league_id));

drop policy if exists "members read reactions" on comment_reactions;
create policy "members read reactions" on comment_reactions
  for select to authenticated using (
    exists (select 1 from comments c where c.id = comment_id and is_member(c.league_id))
  );

drop policy if exists "members react" on comment_reactions;
create policy "members react" on comment_reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from comments c where c.id = comment_id and is_member(c.league_id))
  );

drop policy if exists "take back own reaction" on comment_reactions;
create policy "take back own reaction" on comment_reactions
  for delete to authenticated using (user_id = auth.uid());

-- The person mentioned sees it in their notifications; the author can see who
-- they mentioned.
drop policy if exists "read own mentions" on comment_mentions;
create policy "read own mentions" on comment_mentions
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from comments c where c.id = comment_id and c.author_id = auth.uid())
  );

-- Only the comment's author, and only for people in the same league.
drop policy if exists "author mentions members" on comment_mentions;
create policy "author mentions members" on comment_mentions
  for insert to authenticated with check (
    exists (
      select 1 from comments c
      join league_members m on m.league_id = c.league_id and m.user_id = comment_mentions.user_id
      where c.id = comment_id and c.author_id = auth.uid()
    )
  );

drop policy if exists "mark own mentions seen" on comment_mentions;
create policy "mark own mentions seen" on comment_mentions
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
