-- Profile customization: favorite team theme, avatars, titles, pick effects,
-- Discord bot preferences, Lock of the Week, and weekly trash talk.
-- Run after 0004 in the Supabase SQL editor (or `supabase db push`).

alter table profiles
  add column title text check (char_length(title) <= 40),
  add column avatar_kind text not null default 'photo'
    check (avatar_kind in ('photo', 'monogram')),
  add column team_theme boolean not null default true,
  add column win_effect text not null default 'confetti'
    check (win_effect in ('confetti', 'fireworks', 'pulse', 'none')),
  add column loss_effect text not null default 'deflate'
    check (loss_effect in ('shake', 'rain', 'deflate', 'none')),
  add column bot_mentions boolean not null default true,
  add column reminder_style text not null default 'gentle'
    check (reminder_style in ('gentle', 'roast'));

alter table profiles
  add constraint favorite_team_abbr check (favorite_team ~ '^[A-Z]{2,3}$'),
  -- Discord's CDN or this project's avatars bucket, nothing else.
  add constraint avatar_url_source check (
    avatar_url like 'https://cdn.discordapp.com/%'
    or avatar_url like '%/storage/v1/object/public/avatars/%'
  );

-- Discord sign-ups start with their Discord avatar.
update profiles p
set avatar_url = u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
where u.id = p.id and p.avatar_url is null
  and u.raw_user_meta_data ->> 'avatar_url' like 'https://cdn.discordapp.com/%';

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data -> 'custom_claims' ->> 'global_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Player'
    ),
    case when new.raw_user_meta_data ->> 'avatar_url' like 'https://cdn.discordapp.com/%'
      then new.raw_user_meta_data ->> 'avatar_url' end
  );
  return new;
end $$;

-- Uploaded avatars live in a public bucket, one folder per user.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "read own avatar files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "remove own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Lock of the Week: one pick per member per league per week. It rides on the
-- pick row, so the existing kickoff rule keeps it hidden from everyone else.
alter table picks add column is_lock boolean not null default false;

create function check_one_lock() returns trigger
language plpgsql security definer set search_path = public as $$
declare g games;
begin
  if not exists (select 1 from picks where id = new.id and is_lock) then return null; end if;
  select * into g from games where id = new.game_id;
  if exists (
    select 1 from picks p join games pg on pg.id = p.game_id
    where p.league_id = new.league_id and p.user_id = new.user_id
      and p.id <> new.id and p.is_lock
      and pg.season = g.season and pg.week = g.week
  ) then
    raise exception 'You already have a lock this week.' using errcode = '23505';
  end if;
  return null;
end $$;

create constraint trigger one_lock_per_week
  after insert or update of is_lock on picks
  deferrable initially deferred
  for each row execute function check_one_lock();

-- Makes a game your lock (moving it off any other game that week), or clears it.
-- Once your lock's game kicks off it can't move. Runs as the caller, so RLS applies.
create function set_lock(p_league uuid, p_game text, p_on boolean) returns void
language plpgsql set search_path = public as $$
declare
  g games;
  changed integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform lock_member_picks(p_league);
  select * into g from games where id = p_game;
  if g.id is null then raise exception 'Game not found.'; end if;
  if g.kickoff <= now() then
    raise exception 'That game has already started.' using errcode = '42501';
  end if;
  if p_on then
    if exists (
      select 1 from picks p join games pg on pg.id = p.game_id
      where p.league_id = p_league and p.user_id = auth.uid() and p.is_lock
        and pg.season = g.season and pg.week = g.week and pg.kickoff <= now()
    ) then
      raise exception 'Your lock this week is already in play.' using errcode = '42501';
    end if;
    update picks p set is_lock = false
    from games pg
    where pg.id = p.game_id and p.league_id = p_league and p.user_id = auth.uid()
      and p.is_lock and p.game_id <> p_game and pg.season = g.season and pg.week = g.week;
  end if;
  update picks set is_lock = p_on
  where league_id = p_league and user_id = auth.uid() and game_id = p_game;
  get diagnostics changed = row_count;
  if changed = 0 then raise exception 'Pick a team in that game first.'; end if;
end $$;

-- When a week's trash talk goes public: the first Sunday kickoff (Eastern),
-- or the week's first kickoff if there are no Sunday games.
create function week_reveal_at(p_season integer, p_week integer) returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce(
    min(kickoff) filter (where extract(dow from kickoff at time zone 'America/New_York') = 0),
    min(kickoff)
  )
  from games where season = p_season and week = p_week
$$;

create table trash_talk (
  league_id uuid not null references leagues (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  season integer not null,
  week integer not null,
  body text not null check (char_length(body) between 1 and 140),
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id, season, week)
);

alter table trash_talk enable row level security;

-- Your own line always; everyone's once the week's reveal time passes.
create policy "read trash talk" on trash_talk
  for select to authenticated using (
    is_member(league_id) and (
      user_id = auth.uid()
      or now() >= coalesce(week_reveal_at(season, week), 'infinity')
    )
  );
create policy "write trash talk before reveal" on trash_talk
  for insert to authenticated with check (
    user_id = auth.uid() and is_member(league_id)
    and now() < coalesce(week_reveal_at(season, week), 'infinity')
  );
create policy "edit trash talk before reveal" on trash_talk
  for update to authenticated
  using (user_id = auth.uid() and now() < coalesce(week_reveal_at(season, week), 'infinity'))
  with check (user_id = auth.uid() and now() < coalesce(week_reveal_at(season, week), 'infinity'));
create policy "delete trash talk before reveal" on trash_talk
  for delete to authenticated
  using (user_id = auth.uid() and now() < coalesce(week_reveal_at(season, week), 'infinity'));
