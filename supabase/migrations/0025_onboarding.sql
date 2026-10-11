-- What each player has seen of the onboarding (What's new cards, new dots,
-- practice week, Rookie checklist), so it follows the account across devices
-- and can be reset for testing. Safe to run more than once.
--
-- Reset someone to see everything again as an existing player:
--   update profiles set onboarding = '{}' where id = (select id from auth.users where email = 'friend@example.com');
-- Or as a brand-new player (practice week + Rookie checklist):
--   update profiles set onboarding = '{"player":"new"}' where id = (select id from auth.users where email = 'friend@example.com');

alter table profiles
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

comment on column profiles.onboarding is
  'Onboarding seen by this player. Set {"player":"new"} or {"player":"veteran"} to override the account-age rule.';
