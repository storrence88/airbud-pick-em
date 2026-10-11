-- Commissioner pick entry: the commissioner enters a pick a member texted in,
-- before kickoff, and the pick carries an "entered by commissioner" note.
-- Safe to run more than once. Run after 0012 in the Supabase SQL editor (or
-- `supabase db push`).

-- Who entered the pick when it wasn't the member. It rides on the pick row, so
-- the kickoff rule keeps it hidden from everyone else until the game starts.
alter table picks
  add column if not exists entered_by uuid references profiles (id) on delete set null;

-- Only enter_pick_for sets entered_by. A member's own write can't set it, and
-- choosing a team themselves clears it; re-ranking or a Lock of the Week keeps it.
create or replace function guard_entered_by() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() = new.user_id then
    if tg_op = 'INSERT' or new.team is distinct from old.team then
      new.entered_by := null;
    else
      new.entered_by := old.entered_by;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists picks_entered_by on picks;
create trigger picks_entered_by
  before insert or update on picks
  for each row execute function guard_entered_by();

-- Saves a pick for another member, under the same rules as save_pick (0006):
-- only before kickoff, and in confidence leagues a first-time pick takes the
-- lowest value still open to them. p_confidence asks for a value instead; if
-- another of their open games holds it, the two trade values. Nothing about
-- their other picks is returned, so the commissioner sees no more than they enter.
create or replace function enter_pick_for(
  p_league uuid, p_user uuid, p_game text, p_team text, p_confidence integer default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mode scoring_mode;
  g games;
  v_count integer;
  v_old integer;
  v_open integer[];
  v integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_commissioner(p_league) then
    raise exception 'Only the league commissioner can enter picks for others.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Make your own picks on the league page.';
  end if;
  if not exists (
    select 1 from league_members where league_id = p_league and user_id = p_user
  ) then
    raise exception 'That player is not in this league.';
  end if;
  -- The same lock save_pick takes for that member, so their own edits can't interleave.
  perform pg_advisory_xact_lock(hashtext(p_league::text || ':' || p_user::text));

  select * into g from games where id = p_game;
  if g.id is null then raise exception 'Game not found.'; end if;
  if g.kickoff <= now() or g.state <> 'pre' then
    raise exception 'That game has already started.';
  end if;
  if p_team is distinct from g.home_team and p_team is distinct from g.away_team then
    raise exception 'Pick one of the two teams in that game.';
  end if;

  select mode into v_mode from leagues where id = p_league;
  if v_mode = 'confidence' then
    select confidence into v_old from picks
    where league_id = p_league and user_id = p_user and game_id = p_game;
    select count(*)::int into v_count from games where season = g.season and week = g.week;

    -- Values still open to them: not on a game that has started and not given
    -- up to a missed game (as in save_pick).
    with week_games as (
      select wg.id, (wg.kickoff <= now() or wg.state <> 'pre') as started
      from games wg where wg.season = g.season and wg.week = g.week
    ),
    theirs as (
      select p.confidence, w.started from picks p join week_games w on w.id = p.game_id
      where p.league_id = p_league and p.user_id = p_user and p.confidence is not null
    ),
    missed as (
      select count(*) as cnt from week_games w
      where w.started and not exists (
        select 1 from picks p
        where p.league_id = p_league and p.user_id = p_user and p.game_id = w.id
      )
    ),
    lost as (
      select s from generate_series(1, v_count) s
      where s not in (select confidence from theirs where started)
      order by s limit (select cnt from missed)
    )
    select array_agg(s order by s) into v_open
    from generate_series(1, v_count) s
    where s not in (select confidence from theirs where started)
      and s not in (select l.s from lost l);

    -- A first-time pick takes the lowest open value no other open game holds.
    v := v_old;
    if v is null then
      select min(s) into v from unnest(v_open) s
      where s not in (
        select p.confidence from picks p join games pg on pg.id = p.game_id
        where p.league_id = p_league and p.user_id = p_user and p.confidence is not null
          and pg.season = g.season and pg.week = g.week
      );
    end if;

    if p_confidence is not null and p_confidence is distinct from v then
      if v_open is null or not (p_confidence = any (v_open)) then
        raise exception 'They can''t use % this week. That value is on a game that has started or went to a missed game.', p_confidence;
      end if;
      -- Whichever open game holds the asked-for value takes this game's old one.
      update picks p set confidence = v, updated_at = now()
      from games pg
      where pg.id = p.game_id and p.league_id = p_league and p.user_id = p_user
        and p.game_id <> p_game and p.confidence = p_confidence
        and pg.season = g.season and pg.week = g.week;
      v := p_confidence;
    end if;
  end if;

  insert into picks (league_id, user_id, game_id, team, confidence, entered_by, updated_at)
  values (p_league, p_user, p_game, p_team, v, auth.uid(), now())
  on conflict (league_id, user_id, game_id)
  do update set team = excluded.team, confidence = excluded.confidence,
    entered_by = excluded.entered_by, updated_at = now();
end $$;
