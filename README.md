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

1. **Database:** run each file in `supabase/migrations/` in order in the Supabase SQL editor. `0005_profile_flair.sql` also creates the public `avatars` storage bucket for uploaded profile photos.
2. **Auth redirect:** in Supabase > Authentication > URL Configuration, set the Site URL to your Vercel URL and add `http://localhost:3000/**` and `https://<your-app>.vercel.app/**` as redirect URLs.
3. **Vercel:** import the repo and set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `CRON_SECRET` (any random string).
4. **Pick reminder emails (optional):** set `RESEND_API_KEY` and `REMINDER_EMAIL_FROM` (like `Pick'em <picks@yourdomain.com>`, on a domain verified in [Resend](https://resend.com)) in Vercel. In GitHub, add the repo secret `CRON_SECRET` (same value as Vercel) and the repo variable `APP_URL` (your Vercel URL); the `Pick reminders` workflow then runs hourly.

## How data flows

- Games come from ESPN. Opening a week fetches it and saves it to the `games` table (at most once a minute), and a daily Vercel cron hits `/api/sync`.
- When a game kicks off, its spread is frozen in `locked_spread`; ATS scoring only uses that value.
- Pick reminders: the `Pick reminders` GitHub Actions workflow calls `/api/reminders` hourly. When a game day's first kickoff is 3 hours out or less, everyone with open picks that day gets one email (or, if they chose Discord DMs on their profile, shows up in the bot's `/api/bot/reminders`). `reminder_log` keeps it to one email per person per game day. Running the workflow by hand defaults to a dry run.
- Row-level security does the rules: you can only change your picks before kickoff, and you can only see other members' picks once a game has started.

## Layout

- `src/lib/scoring.ts`: scoring for all three modes (tested)
- `src/lib/nfl/espn.ts`: ESPN scoreboard provider (tested)
- `src/lib/standings.ts`: season and weekly standings (tested)
- `src/lib/flair.ts`: standings badges, streak flame, and last-place trophy (tested)
- `src/lib/reminders.ts`: when pick reminders are due and their wording (tested)
- `src/server/`: server functions for auth, leagues, picks and the game sync
- `supabase/migrations/`: tables, security rules, and the create/join league functions
- `src/routes/`: home, sign in, my leagues, new league, league (picks + standings), invite links
- `src/routes/api/bot/`: read-only JSON API for a Discord bot (games, picks after kickoff, who still needs to pick, standings); see [docs/bot-api.md](docs/bot-api.md)

## Status

Milestone 1: sign in, create and join leagues, weekly picks for all three scoring modes, and standings.
