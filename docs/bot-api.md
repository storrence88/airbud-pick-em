# Pick'em Bot API

A read-only JSON API so a Discord bot can post upcoming games, remind people to
pick, and show everyone's picks once a game kicks off. Picks themselves are made
in the app.

Base URL: `https://<your-app>.vercel.app/api/bot`

## Auth

The league commissioner creates a key on the league page under **Discord bot
access**. The key is shown once and starts with `pickem_`. Send it on every
request:

```
Authorization: Bearer pickem_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A key belongs to one league and can only read. The commissioner can revoke it
from the same panel, and a revoked key gets `401` immediately. Keep it on the
bot's server.

## The one rule

People's picks stay hidden until their game kicks off, the same as in the app.
Before kickoff a game's `picks` list is empty, but `notPicked` still says who
hasn't picked yet (without revealing what anyone else picked), which is what
reminders need.

## Endpoints

### `GET /week?week=6`

Every game in a week. Leave out `week` for the current week.

```bash
curl -H "Authorization: Bearer $PICKEM_KEY" https://<app>/api/bot/week
```

```json
{
  "league": { "id": "…", "name": "Sunday Scaries", "mode": "confidence" },
  "week": 6,
  "games": [ { …a game… } ]
}
```

### `GET /games/{id}`, `GET /games/latest`, `GET /games/next`

One game, in the same shape as in `/week`.

- `/games/{id}`: by game id (the `id` from `/week`).
- `/games/latest`: the game that kicked off most recently. Good for an `/nfl`
  command after the deadline.
- `/games/next`: the next game to kick off this week. Good for reminders.

```bash
curl -H "Authorization: Bearer $PICKEM_KEY" https://<app>/api/bot/games/latest
```

```json
{ "game": { …a game… } }
```

`404` with an `error` message when there's no such game (for example
`/games/latest` before the season's first kickoff).

### A game

```json
{
  "id": "401772938",
  "week": 6,
  "kickoff": "2026-10-11T17:00:00Z",
  "locked": true,
  "state": "in",
  "status": "2nd 4:12",
  "away": { "abbr": "BUF", "name": "Buffalo Bills", "shortName": "Bills", "record": "4-1", "logo": "https://a.espncdn.com/…/buf.png", "score": 10 },
  "home": { "abbr": "KC", "name": "Kansas City Chiefs", "shortName": "Chiefs", "record": "3-2", "logo": "https://a.espncdn.com/…/kc.png", "score": 7 },
  "spread": -2.5,
  "spreadText": "KC -2.5",
  "publicPicks": { "home": 58, "away": 42 },
  "picks": [
    { "displayName": "Steven", "discordId": "123456789012345678", "team": "KC", "confidence": 14 },
    { "displayName": "Nate", "discordId": "234567890123456789", "team": "BUF", "confidence": 9 }
  ],
  "notPicked": [
    { "displayName": "Jordan", "discordId": null }
  ]
}
```

- `kickoff` is the game time in UTC. In Discord, `<t:${Math.floor(Date.parse(kickoff) / 1000)}:F>`
  shows it in each reader's own time zone (`:R` gives "in 2 hours").
- `locked` turns `true` at kickoff. `picks` is empty until then.
- `state` is `pre`, `in` or `post`; `status` is ESPN's short status text
  (like "2nd 4:12" or "Final").
- `record` is the team's season record, or `null` before ESPN has one.
- `spread` is the home team's line (negative means home is favored). It's
  frozen at kickoff in against-the-spread leagues.
- `publicPicks` is the share of ESPN NFL Pick'em players picking each side
  (whole percentages adding to 100), or `null` when ESPN hasn't published it.
- `confidence` is `null` unless the league uses confidence points.
- `discordId` is the member's Discord user id once they've signed in to the app
  with Discord, otherwise `null`. Use it to @mention: `<@${discordId}>`.

## Errors

Errors are JSON, `{ "error": "message" }`: `400` bad `week`, `401` missing,
wrong or revoked key, `404` no such game, `500` something broke on our end.

## discord.js example

```js
const API = "https://<app>/api/bot";
const headers = { Authorization: `Bearer ${process.env.PICKEM_KEY}` };
const get = (path) => fetch(`${API}${path}`, { headers }).then((r) => r.json());
const time = (iso) => `<t:${Math.floor(Date.parse(iso) / 1000)}:R>`;

// /nfl: the latest game and everyone's picks
async function nfl(interaction) {
  const { game, error } = await get("/games/latest");
  if (error) return interaction.reply(error);
  const lines = game.picks.map(
    (p) => `${p.displayName}: ${p.team}${p.confidence ? ` (${p.confidence})` : ""}`,
  );
  await interaction.reply(
    `**${game.away.abbr} ${game.away.score} @ ${game.home.abbr} ${game.home.score}** · ${game.status}\n` +
      (lines.join("\n") || "Nobody picked this one."),
  );
}

// Reminder: ping whoever hasn't picked the next game
async function remind(channel) {
  const { game } = await get("/games/next");
  if (!game || game.notPicked.length === 0) return;
  const who = game.notPicked.map((m) => (m.discordId ? `<@${m.discordId}>` : m.displayName));
  await channel.send(
    `${game.away.abbr} @ ${game.home.abbr} kicks off ${time(game.kickoff)}. Still need picks from ${who.join(", ")}.`,
  );
}
```
