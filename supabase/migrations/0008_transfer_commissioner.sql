-- Transfer commissioner: the commissioner hands the role to another member and
-- becomes a regular member. Safe to run more than once.
-- Run after 0007 in the Supabase SQL editor (or `supabase db push`).

-- league_members has no update policy, so roles only change through here.
-- is_commissioner() comes from 0004.
create or replace function transfer_commissioner(p_league uuid, p_new_commissioner uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- Lock the roster so two transfers at once can't both pass the check.
  perform 1 from league_members where league_id = p_league for update;
  if not is_commissioner(p_league) then
    raise exception 'Only the league commissioner can transfer the role.' using errcode = '42501';
  end if;
  if p_new_commissioner = auth.uid() then
    raise exception 'You are already the commissioner.';
  end if;
  if not exists (
    select 1 from league_members where league_id = p_league and user_id = p_new_commissioner
  ) then
    raise exception 'That player is not in this league.';
  end if;
  update league_members
  set role = case when user_id = p_new_commissioner then 'commissioner' else 'member' end::member_role
  where league_id = p_league and user_id in (auth.uid(), p_new_commissioner);
end $$;
