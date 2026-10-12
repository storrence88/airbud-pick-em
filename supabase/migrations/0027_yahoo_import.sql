-- Importing past weeks from Yahoo Pick'em: the commissioner pastes a finished
-- week's picks and they're saved as if the players had made them here, so the
-- standings, past weeks, weekly winners and stats all count them.
-- Safe to run more than once. Run in the Supabase SQL editor (or `supabase db push`).

-- Marks picks that came from an import rather than from the player.
alter table picks
  add column if not exists imported boolean not null default false;

-- Replaces the listed players' picks for one finished week of the league's
-- season. p_rows is [{userId, picks: [{gameId, team, confidence}], tiebreaker}].
-- Every game that week must be final. A player's existing picks that week are
-- replaced as a whole; players not listed are left alone. Imported weeks have
-- no Lock of the Week. Returns how many picks were saved.
create or replace function import_week_picks(p_league uuid, p_week integer, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_mode scoring_mode;
  v_season integer;
  v_count integer;
  v_tb_game text;
  r jsonb;
  p jsonb;
  v_user uuid;
  g games;
  v_conf integer;
  v_tb integer;
  v_seen integer[];
  v_saved integer := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_commissioner(p_league) then
    raise exception 'Only the league commissioner can import picks.' using errcode = '42501';
  end if;
  select mode, season into v_mode, v_season from leagues where id = p_league;

  select count(*)::int into v_count from games where season = v_season and week = p_week;
  if v_count = 0 then
    raise exception 'Week % has no games yet.', p_week;
  end if;
  if exists (select 1 from games where season = v_season and week = p_week and state <> 'post') then
    raise exception 'Week % isn''t over yet. Only finished weeks can be imported.', p_week;
  end if;
  -- The Monday night tiebreaker rides on the week's last game, as in the app.
  select id into v_tb_game from games where season = v_season and week = p_week
  order by kickoff desc, id desc limit 1;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_user := (r ->> 'userId')::uuid;
    if not exists (
      select 1 from league_members where league_id = p_league and user_id = v_user
    ) then
      raise exception 'Everyone imported has to be in the league first.';
    end if;
    perform pg_advisory_xact_lock(hashtext(p_league::text || ':' || v_user::text));

    delete from picks pk using games pg
    where pg.id = pk.game_id and pk.league_id = p_league and pk.user_id = v_user
      and pg.season = v_season and pg.week = p_week;

    v_tb := nullif(r ->> 'tiebreaker', '')::int;
    if v_tb is not null and (v_tb < 0 or v_tb > 200) then
      raise exception 'A tiebreaker of % is out of range.', v_tb;
    end if;
    v_seen := '{}';

    for p in select * from jsonb_array_elements(r -> 'picks') loop
      select * into g from games
      where id = p ->> 'gameId' and season = v_season and week = p_week;
      if g.id is null then
        raise exception 'A pick is for a game outside week %.', p_week;
      end if;
      if (p ->> 'team') is distinct from g.home_team and (p ->> 'team') is distinct from g.away_team then
        raise exception '% didn''t play in that game.', p ->> 'team';
      end if;

      v_conf := null;
      if v_mode = 'confidence' then
        v_conf := (p ->> 'confidence')::int;
        if v_conf is null or v_conf < 1 or v_conf > v_count then
          raise exception 'Confidence must be between 1 and %.', v_count;
        end if;
        if v_conf = any (v_seen) then
          raise exception '% points is used twice.', v_conf;
        end if;
        v_seen := v_seen || v_conf;
      end if;

      insert into picks (league_id, user_id, game_id, team, confidence, tiebreaker, imported, updated_at)
      values (
        p_league, v_user, g.id, p ->> 'team', v_conf,
        case when g.id = v_tb_game then v_tb end, true, now()
      );
      v_saved := v_saved + 1;
    end loop;
  end loop;
  return v_saved;
end $$;
