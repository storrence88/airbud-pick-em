-- Delete league: the commissioner deletes the league after typing its name.
-- Members, picks (and Locks of the Week), bot keys and trash talk all reference
-- leagues with on delete cascade, so they go with it. Safe to run more than once.
-- Run after 0008 in the Supabase SQL editor (or `supabase db push`).

-- leagues has no delete policy, so leagues are only deleted through here.
-- is_commissioner() comes from 0004.
create or replace function delete_league(p_league uuid, p_confirm_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare l leagues;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- Lock the league row so a rename can't slip in between the check and the delete.
  select * into l from leagues where id = p_league for update;
  if not found or not is_commissioner(p_league) then
    raise exception 'Only the league commissioner can delete the league.' using errcode = '42501';
  end if;
  if trim(coalesce(p_confirm_name, '')) <> trim(l.name) then
    raise exception 'Type the league name exactly to confirm.';
  end if;
  delete from leagues where id = p_league;
end $$;
