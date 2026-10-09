# Airbud Pick'em

A private NFL pick'em league for friends: a modern, animated take on Yahoo Pick'em.

**Stack:** TanStack Start (React 19, TanStack Router + Query), Tailwind CSS v4 + shadcn/ui, Motion, Supabase (Postgres with row-level security + magic-link auth), deployed on Vercel. NFL schedule, scores and spreads come from ESPN's public scoreboard feed.

## Scoring modes

- **Straight Up**: pick who wins. One point per correct pick.
- **Against the Spread**: pick who covers the line. The spread is frozen when picks lock.
- **Confidence Points**: pick every winner and rank them; a correct pick earns its rank in points.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase values
npm run dev                  # http://localhost:3000
```

Other scripts: `npm test` (Vitest), `npm run check` (Biome), `npm run build`.

## One-time setup

1. **Database:** run each file in `supabase/migrations/` in order in the Supabase SQL editor.
2. **Auth redirect:** in Supabase > Authentication > URL Configuration, set the Site URL to your Vercel URL and add `http://localhost:3000/**` and `https://<your-app>.vercel.app/**` as redirect URLs.
3. **Vercel:** import the repo and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `CRON_SECRET` (any random string).

## How data flows

- Games come from ESPN. Opening a week fetches it and saves it to the `games` table (at most once a minute), and a daily Vercel cron hits `/api/sync`.
- When a game kicks off, its spread is frozen in `locked_spread`; ATS scoring only uses that value.
- Row-level security does the rules: you can only change your picks before kickoff, and you can only see other members' picks once a game has started.

## Layout

- `src/lib/scoring.ts`: scoring for all three modes (tested)
- `src/lib/nfl/espn.ts`: ESPN scoreboard provider (tested)
- `src/lib/standings.ts`: season and weekly standings (tested)
- `src/server/`: server functions for auth, leagues, picks and the game sync
- `supabase/migrations/`: tables, security rules, and the create/join league functions
- `src/routes/`: home, sign in, my leagues, new league, league (picks + standings), invite links
- `src/routes/api/bot/`: JSON API for a Discord bot to read the week and make picks; see [docs/bot-api.md](docs/bot-api.md)

## Status

Milestone 1: sign in, create and join leagues, weekly picks for all three scoring modes, and standings.
