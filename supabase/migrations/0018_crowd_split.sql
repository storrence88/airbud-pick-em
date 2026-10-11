-- ESPN Pick'em's public split for each game, saved once picks lock, so season
-- stats can say how often a player beat the crowd. Safe to run more than once.

alter table games
  add column if not exists crowd_home_pct smallint
  check (crowd_home_pct between 0 and 100);

comment on column games.crowd_home_pct is
  'Share of ESPN Pick''em players on the home team when picks locked.';
