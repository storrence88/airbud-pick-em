-- League settings: the commissioner renames the league and sets the push value
-- through one checked function instead of a raw table update.
-- Run after 0006 in the Supabase SQL editor (or `supabase db push`).

-- The old policy let the league's creator update any column (mode, season,
-- invite code, created_by) straight through the API, and keyed off created_by
-- rather than the commissioner role. All league edits now go through the RPC.
drop policy "commissioner edits league" on leagues;

create function is_commissioner(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from league_members
    where league_id = lid and user_id = auth.uid() and role = 'commissioner'
  )
$$;

create function update_league_settings(p_league uuid, p_name text, p_push_value numeric)
returns leagues
language plpgsql security definer set search_path = public as $$
declare l leagues;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not is_commissioner(p_league) then
    raise exception 'Only the league commissioner can change settings.' using errcode = '42501';
  end if;
  p_name := trim(p_name);
  if p_name is null or char_length(p_name) not between 1 and 60 then
    raise exception 'League name must be 1 to 60 characters.';
  end if;
  if p_push_value is null or p_push_value not in (0, 0.5, 1) then
    raise exception 'Push value must be 0, 0.5 or 1.';
  end if;
  update leagues
  set name = p_name,
      settings = settings || jsonb_build_object('pushValue', p_push_value)
  where id = p_league
  returning * into l;
  return l;
end $$;
