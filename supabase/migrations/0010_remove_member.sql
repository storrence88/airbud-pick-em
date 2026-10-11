-- Remove member: the commissioner kicks a member out of the league, keeping
-- or wiping their picks. Safe to run more than once.
-- Run after 0009 in the Supabase SQL editor (or `supabase db push`).

-- Members can only delete their own league_members row, and picks and trash
-- talk only before kickoff or the reveal, so removals go through here.
-- is_commissioner() comes from 0004.
--
-- Keeping picks keeps everything on games that have kicked off, so the
-- standings can still show their season and a rejoin brings it back. Picks on
-- games still to come go either way, since they won't be playing them.
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
  else
    delete from picks where league_id = p_league and user_id = p_user;
    delete from trash_talk where league_id = p_league and user_id = p_user;
  end if;

  delete from league_members where league_id = p_league and user_id = p_user;
end $$;
