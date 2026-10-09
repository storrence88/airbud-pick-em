-- Bot API: league-scoped API keys, and pick functions a bot calls on behalf
-- of a member identified by their linked Discord account.
-- Run after 0003_discord_display_name.sql in the Supabase SQL editor (or `supabase db push`).

create function is_commissioner(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from league_members
    where league_id = lid and user_id = auth.uid() and role = 'commissioner'
  )
$$;

-- Only a SHA-256 hash of each key is stored; the key itself is shown once.
create table bot_keys (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  key_hash text not null unique,
  key_prefix text not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table bot_keys enable row level security;

create policy "commissioner reads bot keys" on bot_keys
  for select to authenticated using (is_commissioner(league_id));
create policy "commissioner creates bot keys" on bot_keys
  for insert to authenticated
  with check (is_commissioner(league_id) and created_by = auth.uid());
create policy "commissioner revokes bot keys" on bot_keys
  for update to authenticated
  using (is_commissioner(league_id)) with check (is_commissioner(league_id));

-- Everything below is called by the server with the secret key after it has
-- checked the bot's API key. None of it is callable from the browser.

-- The app user whose linked Discord login has this Discord user id.
create function discord_user(p_discord_id text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select user_id from auth.identities
  where provider = 'discord' and provider_id = p_discord_id
  limit 1
$$;

-- Each member's Discord user id, when they have linked one.
create function league_discord_ids(p_league uuid)
returns table (user_id uuid, discord_id text)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, i.provider_id
  from league_members m
  join auth.identities i on i.user_id = m.user_id and i.provider = 'discord'
  where m.league_id = p_league
$$;

-- Same lock as lock_member_picks, so app and bot writes for one member queue up.
create function lock_member_picks(p_league uuid, p_user uuid) returns void
language sql as $$
  select pg_advisory_xact_lock(hashtext(p_league::text || ':' || p_user::text))
$$;

-- save_pick for a given member. The app's save_pick leans on RLS for the
-- membership and kickoff rules; this runs without RLS, so it checks them itself.
create function bot_save_pick(p_user uuid, p_league uuid, p_game text, p_team text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_mode scoring_mode;
  g games;
  v integer;
begin
  perform lock_member_picks(p_league, p_user);
  select l.mode into v_mode from leagues l
  join league_members m on m.league_id = l.id and m.user_id = p_user
  where l.id = p_league;
  if v_mode is null then
    raise exception 'That Discord user is not in this league.' using errcode = 'P0002';
  end if;
  select * into g from games where id = p_game;
  if g.id is null then
    raise exception 'Unknown game %.', p_game using errcode = 'P0002';
  end if;
  if g.kickoff <= now() then
    raise exception 'That game has already started.' using errcode = '42501';
  end if;
  if p_team not in (g.home_team, g.away_team) then
    raise exception '% is not playing in that game.', p_team using errcode = '22023';
  end if;

  if v_mode = 'confidence' then
    select confidence into v from picks
    where league_id = p_league and user_id = p_user and game_id = p_game;
    if v is null then
      select min(s) into v
      from generate_series(1, (select count(*)::int from games where season = g.season and week = g.week)) s
      where s not in (
        select p.confidence from picks p join games pg on pg.id = p.game_id
        where p.league_id = p_league and p.user_id = p_user
          and p.confidence is not null and pg.season = g.season and pg.week = g.week
      );
    end if;
  end if;

  insert into picks (league_id, user_id, game_id, team, confidence, updated_at)
  values (p_league, p_user, p_game, p_team, v, now())
  on conflict (league_id, user_id, game_id)
  do update set team = excluded.team, confidence = excluded.confidence, updated_at = now();
  return v;
end $$;

-- set_confidence for a given member. Uniqueness and range are still enforced
-- by the confidence_unique_per_week trigger at commit.
create function bot_set_confidence(p_user uuid, p_league uuid, p_values jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mode scoring_mode;
  item jsonb;
  g games;
begin
  perform lock_member_picks(p_league, p_user);
  select l.mode into v_mode from leagues l
  join league_members m on m.league_id = l.id and m.user_id = p_user
  where l.id = p_league;
  if v_mode is null then
    raise exception 'That Discord user is not in this league.' using errcode = 'P0002';
  end if;
  if v_mode <> 'confidence' then
    raise exception 'This league does not use confidence points.' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(p_values) loop
    select * into g from games where id = item ->> 'gameId';
    if g.id is null then
      raise exception 'Unknown game %.', item ->> 'gameId' using errcode = 'P0002';
    end if;
    if g.kickoff <= now() then
      raise exception 'That game has already started.' using errcode = '42501';
    end if;
    update picks
    set confidence = (item ->> 'confidence')::int, updated_at = now()
    where league_id = p_league and user_id = p_user and game_id = g.id;
    if not found then
      raise exception 'Pick a winner for game % before ranking it.', g.id using errcode = 'P0002';
    end if;
  end loop;
end $$;

revoke execute on function discord_user(text) from public, anon, authenticated;
revoke execute on function league_discord_ids(uuid) from public, anon, authenticated;
revoke execute on function lock_member_picks(uuid, uuid) from public, anon, authenticated;
revoke execute on function bot_save_pick(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function bot_set_confidence(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function discord_user(text) to service_role;
grant execute on function league_discord_ids(uuid) to service_role;
grant execute on function lock_member_picks(uuid, uuid) to service_role;
grant execute on function bot_save_pick(uuid, uuid, text, text) to service_role;
grant execute on function bot_set_confidence(uuid, uuid, jsonb) to service_role;
