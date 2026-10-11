-- Leave league: a member takes themselves out of a league. Safe to run more
-- than once. Run after 0010 in the Supabase SQL editor (or `supabase db push`).

-- The commissioner can't just walk away and leave the league without one, so
-- the self-delete policy from 0001 now skips them.
drop policy if exists "leave a league" on league_members;
create policy "leave a league" on league_members
  for delete to authenticated
  using (user_id = auth.uid() and role <> 'commissioner');

-- Leaving works like the commissioner removing someone with "keep picks"
-- (0010): picks on games that have kicked off stay so the standings keep
-- their season under Former members, and picks on games still to come go,
-- since they won't be playing them. Rejoining with the invite link brings the
-- season back.
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

  delete from league_members where league_id = p_league and user_id = auth.uid();
end $$;
