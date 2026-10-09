-- Missed games: a game that kicks off without a pick scores 0 and gives up the
-- lowest confidence value the kicked-off picks don't hold, so the top values
-- stay open for the games still left (mirrors forfeited() in src/lib/confidence.ts).
-- Run after 0005 in the Supabase SQL editor (or `supabase db push`).

-- Same as 0002, except a first-time pick skips the values missed games gave up.
create or replace function save_pick(p_league uuid, p_game text, p_team text) returns integer
language plpgsql set search_path = public as $$
declare
  v_mode scoring_mode;
  g games;
  v_count integer;
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
      select count(*)::int into v_count from games where season = g.season and week = g.week;
      with week_games as (
        select wg.id, (wg.kickoff <= now() or wg.state <> 'pre') as started
        from games wg where wg.season = g.season and wg.week = g.week
      ),
      mine as (
        select p.confidence, w.started from picks p join week_games w on w.id = p.game_id
        where p.league_id = p_league and p.user_id = auth.uid() and p.confidence is not null
      ),
      missed as (
        select count(*) as cnt from week_games w
        where w.started and not exists (
          select 1 from picks p
          where p.league_id = p_league and p.user_id = auth.uid() and p.game_id = w.id
        )
      ),
      lost as (
        select s from generate_series(1, v_count) s
        where s not in (select confidence from mine where started)
        order by s limit (select cnt from missed)
      )
      select min(s) into v
      from generate_series(1, v_count) s
      where s not in (select confidence from mine)
        and s not in (select l.s from lost l);
    end if;
  end if;

  insert into picks (league_id, user_id, game_id, team, confidence, updated_at)
  values (p_league, auth.uid(), p_game, p_team, v, now())
  on conflict (league_id, user_id, game_id)
  do update set team = excluded.team, confidence = excluded.confidence, updated_at = now();
  return v;
end $$;
