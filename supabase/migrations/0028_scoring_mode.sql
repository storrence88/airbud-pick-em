-- Lets the commissioner change the league's scoring mode after it's created.
-- Safe to run more than once. Run in the Supabase SQL editor (or `supabase db push`).
--
-- Standings are scored from the picks with the current mode, so a switch applies
-- to the whole season. Switching to confidence: open picks without points get
-- the lowest free values when the league page next loads (repair() in
-- src/lib/confidence.ts), and picks on games already played score 0 until that
-- week is imported again (Import weeks from Yahoo).
create or replace function set_league_mode(p_league uuid, p_mode scoring_mode)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_commissioner(p_league) then
    raise exception 'Only the league commissioner can change the scoring.' using errcode = '42501';
  end if;
  update leagues set mode = p_mode where id = p_league;
end $$;
