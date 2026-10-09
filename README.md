# Airbud Pick'em

A private NFL pick'em league for friends: a modern, animated take on Yahoo Pick'em.

**Stack:** TanStack Start (React 19, TanStack Router + Query), Tailwind CSS v4 + shadcn/ui, Motion, Supabase (Postgres + magic-link auth), Drizzle ORM, deployed on Vercel. NFL schedule, scores and spreads come from ESPN's public scoreboard feed.

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

Other scripts: `npm test` (Vitest), `npm run check` (Biome), `npm run build`, `npm run db:push` (apply the Drizzle schema to Supabase).

## Layout

- `src/lib/scoring.ts`: scoring for all three modes (tested)
- `src/lib/nfl/espn.ts`: ESPN scoreboard provider (tested)
- `src/db/schema.ts`: profiles, leagues, members, games, picks
- `src/routes/`: home, weekly picks, new league, sign in

## Status

Milestone 1 in progress. Picks are saved in the browser until the Supabase project is connected; league creation is disabled until then.
