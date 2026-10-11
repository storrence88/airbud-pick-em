-- Survivor picks follow the main picks when someone leaves or is removed.
-- Before this, "wipe picks" left the player's survivor history behind, and a
-- leave or "keep picks" removal left their upcoming survivor pick in place.
-- Same rules as 0010 and 0011: survivor picks on games that have kicked off
-- stay with "keep picks" (and when leaving), upcoming ones always go, and
-- "wipe picks" clears them all. Safe to run more than once.
-- Run after 0025 in the Supabase SQL editor (or `supabase db push`).

create or replace function remove_member(p_league uuid, p_user uuid, p_keep_picks boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- Lock the roster so a transfer can't slip in between the check and the delete.
  perform 1 from league_members where league_id = p_league for update;
  if not is_commissioner(p_league) then
    raise exception 'Only the league commissioner can remove members.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You can''t remove yourself. Transfer the commissioner role first.';
  end if;
  if not exists (
    select 1 from league_members where league_id = p_league and user_id = p_user
  ) then
    raise exception 'That player is not in this league.';
  end if;

  if p_keep_picks then
    delete from picks p
    using games g
    where p.league_id = p_league and p.user_id = p_user
      and g.id = p.game_id and g.kickoff > now();
    delete from survivor_picks s
    using games g
    where s.league_id = p_league and s.user_id = p_user
      and g.id = s.game_id and g.kickoff > now();
  else
    delete from picks where league_id = p_league and user_id = p_user;
    delete from trash_talk where league_id = p_league and user_id = p_user;
    delete from survivor_picks where league_id = p_league and user_id = p_user;
  end if;

  delete from league_members where league_id = p_league and user_id = p_user;
end $$;

create or replace function leave_league(p_league uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  my_role member_role;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- Lock the roster so a transfer can't make us commissioner mid-leave.
  perform 1 from league_members where league_id = p_league for update;
  select role into my_role from league_members
  where league_id = p_league and user_id = auth.uid();
  if not found then
    raise exception 'You''re not in this league.';
  end if;
  if my_role = 'commissioner' then
    raise exception 'Transfer the commissioner role before leaving the league.'
      using errcode = '42501';
  end if;

  delete from picks p
  using games g
  where p.league_id = p_league and p.user_id = auth.uid()
    and g.id = p.game_id and g.kickoff > now();
  delete from survivor_picks s
  using games g
  where s.league_id = p_league and s.user_id = auth.uid()
    and g.id = s.game_id and g.kickoff > now();

  delete from league_members where league_id = p_league and user_id = auth.uid();
end $$;

-- One-time cleanup: survivor picks left behind by earlier "wipe picks"
-- removals, i.e. players with survivor picks but no picks and no membership.
delete from survivor_picks s
where not exists (
    select 1 from league_members m
    where m.league_id = s.league_id and m.user_id = s.user_id
  )
  and not exists (
    select 1 from picks p
    where p.league_id = s.league_id and p.user_id = s.user_id
  );

-- And upcoming survivor picks of anyone who already left or was removed.
delete from survivor_picks s
using games g
where g.id = s.game_id and g.kickoff > now()
  and not exists (
    select 1 from league_members m
    where m.league_id = s.league_id and m.user_id = s.user_id
  );
