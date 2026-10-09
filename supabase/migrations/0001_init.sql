-- Airbud Pick'em schema, row-level security, and league RPCs.
-- Run once in the Supabase SQL editor (or `supabase db push`).

create type scoring_mode as enum ('straight', 'spread', 'confidence');
create type member_role as enum ('commissioner', 'member');
create type game_state as enum ('pre', 'in', 'post');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  favorite_team text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  season integer not null,
  mode scoring_mode not null default 'straight',
  settings jsonb not null default '{}',
  invite_code text not null unique default substr(md5(gen_random_uuid()::text), 1, 8),
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table league_members (
  league_id uuid not null references leagues (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- One row per NFL game, shared by every league. id is ESPN's event id.
create table games (
  id text primary key,
  season integer not null,
  week integer not null,
  kickoff timestamptz not null,
  state game_state not null default 'pre',
  home_team text not null,
  away_team text not null,
  home_score integer not null default 0,
  away_score integer not null default 0,
  current_spread real,
  locked_spread real,
  updated_at timestamptz not null default now()
);
create index games_season_week on games (season, week);

create table picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  game_id text not null references games (id),
  team text not null,
  confidence integer,
  tiebreaker integer,
  is_tiebreaker boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (league_id, user_id, game_id)
);

-- Profile row for every new sign-up, named from the email until they change it.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper used by policies; security definer avoids recursive RLS on league_members.
create function is_member(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_members where league_id = lid and user_id = auth.uid())
$$;

create function create_league(p_name text, p_mode scoring_mode, p_season integer, p_settings jsonb default '{}')
returns leagues
language plpgsql security definer set search_path = public as $$
declare l leagues;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into leagues (name, mode, season, settings, created_by)
  values (p_name, p_mode, p_season, coalesce(p_settings, '{}'), auth.uid())
  returning * into l;
  insert into league_members (league_id, user_id, role) values (l.id, auth.uid(), 'commissioner');
  return l;
end $$;

create function join_league(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select id into lid from leagues where invite_code = lower(trim(p_code));
  if lid is null then raise exception 'invalid invite code'; end if;
  insert into league_members (league_id, user_id) values (lid, auth.uid())
  on conflict do nothing;
  return lid;
end $$;

alter table profiles enable row level security;
alter table leagues enable row level security;
alter table league_members enable row level security;
alter table games enable row level security;
alter table picks enable row level security;

create policy "profiles readable by signed-in users" on profiles
  for select to authenticated using (true);
create policy "edit own profile" on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "members read their leagues" on leagues
  for select to authenticated using (is_member(id));
create policy "commissioner edits league" on leagues
  for update to authenticated using (created_by = auth.uid());

create policy "members see league roster" on league_members
  for select to authenticated using (is_member(league_id));
create policy "leave a league" on league_members
  for delete to authenticated using (user_id = auth.uid());

-- Games are written only by the server sync (secret key bypasses RLS).
create policy "games readable" on games
  for select to authenticated using (true);

-- Your own picks always; everyone else's once that game has kicked off.
create policy "read picks" on picks
  for select to authenticated using (
    is_member(league_id) and (
      user_id = auth.uid()
      or exists (select 1 from games g where g.id = game_id and g.kickoff <= now())
    )
  );
create policy "make picks before kickoff" on picks
  for insert to authenticated with check (
    user_id = auth.uid() and is_member(league_id)
    and exists (select 1 from games g where g.id = game_id and g.kickoff > now())
  );
create policy "change picks before kickoff" on picks
  for update to authenticated
  using (user_id = auth.uid() and exists (select 1 from games g where g.id = game_id and g.kickoff > now()))
  with check (user_id = auth.uid() and exists (select 1 from games g where g.id = game_id and g.kickoff > now()));
create policy "clear picks before kickoff" on picks
  for delete to authenticated
  using (user_id = auth.uid() and exists (select 1 from games g where g.id = game_id and g.kickoff > now()));
