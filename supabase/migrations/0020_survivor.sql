-- Survivor: a side game inside a league. Each week you pick one team to win,
-- you can't use a team twice, and a loss, a tie or a missed week knocks you
-- out. Who's still alive is worked out in the app (src/lib/survivor.ts) from
-- the picks and results here. Safe to run more than once.
-- Run after 0019 in the Supabase SQL editor (or `supabase db push`).

-- One row while the league's survivor pool is on. Turning it off deletes the
-- row, and with it every survivor pick.
create table if not exists survivor_pools (
  league_id uuid primary key references leagues (id) on delete cascade,
  season integer not null,
  start_week integer not null check (start_week between 1 and 18),
  started_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists survivor_picks (
  league_id uuid not null references survivor_pools (league_id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  season integer not null,
  week integer not null check (week between 1 and 18),
  game_id text not null references games (id),
  team text not null,
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id, season, week),
  -- Each team once a season.
  unique (league_id, user_id, season, team)
);

alter table survivor_pools enable row level security;
alter table survivor_picks enable row level security;

drop policy if exists "members read survivor pool" on survivor_pools;
create policy "members read survivor pool" on survivor_pools
  for select to authenticated using (is_member(league_id));

-- Like regular picks: your own always, everyone else's once that game kicks off.
-- Writes only go through save_survivor_pick.
drop policy if exists "read survivor picks" on survivor_picks;
create policy "read survivor picks" on survivor_picks
  for select to authenticated using (
    is_member(league_id) and (
      user_id = auth.uid()
      or exists (select 1 from games g where g.id = game_id and g.kickoff <= now())
    )
  );

-- The commissioner turns survivor on (starting p_start_week) or off.
-- is_commissioner() comes from 0004.
create or replace function set_survivor(p_league uuid, p_on boolean, p_start_week integer)
returns survivor_pools
language plpgsql security definer set search_path = public as $$
declare
  l leagues;
  pool survivor_pools;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_commissioner(p_league) then
    raise exception 'Only the league commissioner can turn survivor on or off.'
      using errcode = '42501';
  end if;
  if not p_on then
    delete from survivor_pools where league_id = p_league returning * into pool;
    return pool;
  end if;

  select * into l from leagues where id = p_league;
  if p_start_week is null or p_start_week not between 1 and 18 then
    raise exception 'Survivor runs in the regular season, weeks 1 to 18.';
  end if;
  if exists (
    select 1 from games
    where season = l.season and week = p_start_week and kickoff <= now()
  ) then
    raise exception 'Week % has already started. Survivor starts with a week nobody has played yet.', p_start_week;
  end if;

  insert into survivor_pools (league_id, season, start_week, started_by)
  values (p_league, l.season, p_start_week, auth.uid())
  on conflict (league_id) do nothing
  returning * into pool;
  if pool is null then
    raise exception 'Survivor is already on for this league.';
  end if;
  return pool;
end $$;

-- Saves (or swaps) your survivor pick for the week of p_game. Locked once the
-- picked game kicks off, like regular picks.
create or replace function save_survivor_pick(p_league uuid, p_game text, p_team text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  pool survivor_pools;
  g games;
  current_pick survivor_picks;
  used_week integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_member(p_league) then
    raise exception 'You''re not in this league.' using errcode = '42501';
  end if;
  select * into pool from survivor_pools where league_id = p_league;
  if not found then
    raise exception 'Survivor isn''t on for this league.';
  end if;

  select * into g from games where id = p_game;
  if not found or g.season <> pool.season then
    raise exception 'That game isn''t part of this survivor season.';
  end if;
  -- Playoff weeks reuse the numbers 1 to 5; anything kicking off after week 18
  -- has started is a playoff game.
  if g.week < 18 and exists (
    select 1 from games where season = pool.season and week = 18 and kickoff < g.kickoff
  ) then
    raise exception 'Survivor is regular season only.';
  end if;
  if g.week < pool.start_week then
    raise exception 'Survivor starts in week %.', pool.start_week;
  end if;
  if g.kickoff <= now() then
    raise exception 'That game has already started.' using errcode = '42501';
  end if;
  if p_team not in (g.home_team, g.away_team) then
    raise exception 'That team isn''t playing in this game.';
  end if;

  select * into current_pick from survivor_picks
  where league_id = p_league and user_id = auth.uid()
    and season = pool.season and week = g.week
  for update;
  if found and exists (
    select 1 from games where id = current_pick.game_id and kickoff <= now()
  ) then
    raise exception 'Your week % pick is locked in.', g.week using errcode = '42501';
  end if;

  select week into used_week from survivor_picks
  where league_id = p_league and user_id = auth.uid()
    and season = pool.season and team = p_team and week <> g.week;
  if found then
    raise exception 'You already used % in week %.', p_team, used_week;
  end if;

  insert into survivor_picks (league_id, user_id, season, week, game_id, team)
  values (p_league, auth.uid(), pool.season, g.week, p_game, p_team)
  on conflict (league_id, user_id, season, week) do update
  set game_id = excluded.game_id, team = excluded.team, updated_at = now();
end $$;

-- Leaving or being removed clears survivor picks on games still to come, the
-- same way 0010 and 0011 treat regular picks. Picks on games that kicked off
-- stay, so the board can still show their run under Former members.
create or replace function clear_future_survivor_picks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from survivor_picks s
  using games g
  where s.league_id = old.league_id and s.user_id = old.user_id
    and g.id = s.game_id and g.kickoff > now();
  return old;
end $$;

drop trigger if exists survivor_member_left on league_members;
create trigger survivor_member_left
  after delete on league_members
  for each row execute function clear_future_survivor_picks();
