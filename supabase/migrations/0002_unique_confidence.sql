-- Confidence points: each value can be used once per week, enforced in the
-- database, and picks are saved and reranked atomically through RPCs.
-- Run after 0001_init.sql in the Supabase SQL editor (or `supabase db push`).

-- Serializes one member's pick writes in one league for the transaction.
create function lock_member_picks(p_league uuid) returns void
language sql as $$
  select pg_advisory_xact_lock(hashtext(p_league::text || ':' || auth.uid()::text))
$$;

-- Checked at commit so a swap (A takes B's value, B takes A's) can pass
-- through a moment where both hold the same value.
create function check_confidence_unique() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g games;
  v integer;
  n integer;
begin
  -- The row may have changed again later in the transaction; check what's there now.
  select confidence into v from picks where id = new.id;
  if v is null then return null; end if;
  select * into g from games where id = new.game_id;
  select count(*) into n from games where season = g.season and week = g.week;
  if v < 1 or v > n then
    raise exception 'Confidence must be between 1 and %.', n;
  end if;
  if exists (
    select 1 from picks p join games pg on pg.id = p.game_id
    where p.league_id = new.league_id and p.user_id = new.user_id
      and p.id <> new.id and p.confidence = v
      and pg.season = g.season and pg.week = g.week
  ) then
    raise exception 'You already used % points this week.', v using errcode = '23505';
  end if;
  return null;
end $$;

create constraint trigger confidence_unique_per_week
  after insert or update of confidence on picks
  deferrable initially deferred
  for each row execute function check_confidence_unique();

-- Saves a pick. In confidence leagues a game picked for the first time gets the
-- lowest value still free that week; changing teams keeps the value it has.
-- Runs as the caller, so the kickoff RLS policies still apply.
create function save_pick(p_league uuid, p_game text, p_team text) returns integer
language plpgsql set search_path = public as $$
declare
  v_mode scoring_mode;
  g games;
  v integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform lock_member_picks(p_league);
  select mode into v_mode from leagues where id = p_league;
  if v_mode is null then raise exception 'League not found, or you are not a member.'; end if;

  if v_mode = 'confidence' then
    select confidence into v from picks
    where league_id = p_league and user_id = auth.uid() and game_id = p_game;
    if v is null then
      select * into g from games where id = p_game;
      select min(s) into v
      from generate_series(1, (select count(*)::int from games where season = g.season and week = g.week)) s
      where s not in (
        select p.confidence from picks p join games pg on pg.id = p.game_id
        where p.league_id = p_league and p.user_id = auth.uid()
          and p.confidence is not null and pg.season = g.season and pg.week = g.week
      );
    end if;
  end if;

  insert into picks (league_id, user_id, game_id, team, confidence, updated_at)
  values (p_league, auth.uid(), p_game, p_team, v, now())
  on conflict (league_id, user_id, game_id)
  do update set team = excluded.team, confidence = excluded.confidence, updated_at = now();
  return v;
end $$;

-- Applies a reranking ([{gameId, confidence}, ...]) in one transaction.
create function set_confidence(p_league uuid, p_values jsonb) returns void
language plpgsql set search_path = public as $$
declare
  item jsonb;
  changed integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  perform lock_member_picks(p_league);
  for item in select * from jsonb_array_elements(p_values) loop
    update picks
    set confidence = (item ->> 'confidence')::int, updated_at = now()
    where league_id = p_league and user_id = auth.uid() and game_id = item ->> 'gameId';
    get diagnostics changed = row_count;
    if changed = 0 then
      raise exception 'That game has already started.' using errcode = '42501';
    end if;
  end loop;
end $$;
