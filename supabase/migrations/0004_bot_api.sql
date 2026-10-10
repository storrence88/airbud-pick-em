-- Bot API: league-scoped, read-only API keys for a Discord bot.
-- Run after 0003_discord_display_name.sql in the Supabase SQL editor (or `supabase db push`).

create function is_commissioner(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from league_members
    where league_id = lid and user_id = auth.uid() and role = 'commissioner'
  )
$$;

-- Only a SHA-256 hash of each key is stored; the key itself is shown once.
create table bot_keys (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  key_hash text not null unique,
  key_prefix text not null,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table bot_keys enable row level security;

create policy "commissioner reads bot keys" on bot_keys
  for select to authenticated using (is_commissioner(league_id));
create policy "commissioner creates bot keys" on bot_keys
  for insert to authenticated
  with check (is_commissioner(league_id) and created_by = auth.uid());
create policy "commissioner revokes bot keys" on bot_keys
  for update to authenticated
  using (is_commissioner(league_id)) with check (is_commissioner(league_id));

-- Called by the server with the secret key after it has checked the bot's
-- API key, so the bot can @mention members. Not callable from the browser.
create function league_discord_ids(p_league uuid)
returns table (user_id uuid, discord_id text)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, i.provider_id
  from league_members m
  join auth.identities i on i.user_id = m.user_id and i.provider = 'discord'
  where m.league_id = p_league
$$;

revoke execute on function league_discord_ids(uuid) from public, anon, authenticated;
grant execute on function league_discord_ids(uuid) to service_role;
