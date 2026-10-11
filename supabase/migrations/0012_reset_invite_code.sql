-- Reset invite link: the commissioner swaps the league's invite code for a new
-- one, so the old link stops working. Safe to run more than once.
-- Run after 0011 in the Supabase SQL editor (or `supabase db push`).

-- leagues has no update policy since 0007, so the code only changes through
-- here. is_commissioner() comes from 0004. Members already in the league stay;
-- only new joins need the new code.
create or replace function reset_invite_code(p_league uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  new_code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_commissioner(p_league) then
    raise exception 'Only the league commissioner can reset the invite link.'
      using errcode = '42501';
  end if;
  -- Same shape as the 0001 default. Retry on the rare clash with another league.
  loop
    new_code := substr(md5(gen_random_uuid()::text), 1, 8);
    begin
      update leagues set invite_code = new_code where id = p_league;
      exit;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  return new_code;
end $$;
