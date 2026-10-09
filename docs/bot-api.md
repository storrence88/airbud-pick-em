# Pick'em Bot API

A small JSON API so a Discord bot can show the week's games, make picks and set
confidence points for league members. Anything the bot does shows up in the app
right away, and the app's rules still apply.

Base URL: `https://<your-app>.vercel.app/api/bot`

## Auth

The league commissioner creates a key on the league page under **Discord bot
access**. The key is shown once; it starts with `pickem_`. Send it on every
request:

```
Authorization: Bearer pickem_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A key belongs to one league. The commissioner can revoke it from the same
panel, and a revoked key gets `401` immediately.

Keep the key on the bot's server, never in a Discord message or client code.
Whoever has it can make picks for any linked member of the league.

## Who a request is for

Requests that act for a person take `discordId`: the Discord user id
(snowflake) of the person who ran the command, e.g. `interaction.user.id` in
discord.js. The bot should always pass the id of the person who invoked the
command, not one they typed.

A Discord user can only be matched once they've signed in to the app with
Discord at least once. Until then the API answers `404` with
`No Pick'em account is linked to that Discord user...`; a good bot reply is a
link to the app's sign-in page.

## Rules the API enforces

- **Picks lock at kickoff.** Changing a pick or its confidence after kickoff
  returns `409`.
- **Friends' picks stay hidden until kickoff.** `GET /week` shows the asking
  member's own picks, and everyone else's picks only for games that have started.
- **Scoring mode.** `confidence` is `null` outside confidence leagues, and
  `POST /confidence` returns `400` there.
- **Confidence values are unique per week.** Each value from 1 to the number of
  games that week can be used once. A first pick gets the lowest free value
  (same as the app); use `POST /confidence` to rearrange.

## Endpoints

### `GET /league`

League info and members.

```bash
curl -H "Authorization: Bearer $PICKEM_KEY" https://<app>/api/bot/league
```

```json
{
  "league": { "id": "…", "name": "Sunday Scaries", "season": 2026, "mode": "confidence" },
  "members": [
    { "displayName": "Steven", "discordId": "123456789012345678", "role": "commissioner" },
    { "displayName": "Jordan", "discordId": null, "role": "member" }
  ]
}
```

`discordId` is `null` for members who haven't signed in with Discord.

### `GET /week?discordId=…&week=…`

The week's games. Both query params are optional: leave out `week` for the
current week, and leave out `discordId` to get just the games and started picks.

```bash
curl -H "Authorization: Bearer $PICKEM_KEY" \
  "https://<app>/api/bot/week?discordId=123456789012345678"
```

```json
{
  "league": { "id": "…", "name": "Sunday Scaries", "mode": "confidence" },
  "week": 6,
  "games": [
    {
      "id": "401772938",
      "kickoff": "2026-10-11T17:00:00Z",
      "locked": false,
      "state": "pre",
      "status": "10/11 - 1:00 PM EDT",
      "away": { "abbr": "BUF", "name": "Bills", "score": 0 },
      "home": { "abbr": "KC", "name": "Chiefs", "score": 0 },
      "spread": -2.5,
      "spreadText": "KC -2.5",
      "myPick": { "team": "KC", "confidence": 14 },
      "picks": []
    }
  ]
}
```

- `id` is the game id to use when picking.
- `spread` is the home team's line (negative means home is favored). In
  against-the-spread leagues it's frozen at kickoff and that's the line scored.
- `picks` lists other members' picks and is empty until `locked` is `true`.

### `POST /picks`

Make or change one pick.

```bash
curl -X POST -H "Authorization: Bearer $PICKEM_KEY" -H "Content-Type: application/json" \
  -d '{"discordId":"123456789012345678","gameId":"401772938","team":"KC"}' \
  https://<app>/api/bot/picks
```

```json
{ "gameId": "401772938", "team": "KC", "confidence": 14 }
```

`team` is the team abbreviation from `/week` (case doesn't matter). Switching
teams on a game keeps its confidence value.

### `POST /confidence`

Set confidence values for one or more games at once. All or nothing: if any
value fails, nothing changes. The game must already have a pick.

Because values are unique per week, moving a game to a value another game
already holds means sending both. To swap two games:

```bash
curl -X POST -H "Authorization: Bearer $PICKEM_KEY" -H "Content-Type: application/json" \
  -d '{"discordId":"123456789012345678","values":[{"gameId":"401772938","confidence":16},{"gameId":"401772941","confidence":14}]}' \
  https://<app>/api/bot/confidence
```

```json
{ "ok": true, "values": [ … ] }
```

### `GET /standings`

Season standings from finished games, best first.

```json
{
  "standings": [
    { "rank": 1, "displayName": "Steven", "discordId": "123…", "points": 212, "correct": 58, "byWeek": { "1": 31, "2": 40 } }
  ]
}
```

## Errors

Errors are JSON: `{ "error": "message you can show the user" }`.

| Status | Meaning |
| --- | --- |
| 400 | Bad input: wrong team, value out of range, value used twice, wrong scoring mode |
| 401 | Missing, wrong or revoked API key |
| 404 | Discord user not linked or not in the league, unknown game, or ranking a game with no pick |
| 409 | Game already started, or that confidence value is already on another game |
| 500 | Something broke on our end |

## discord.js example

```js
const API = "https://<app>/api/bot";
const headers = {
  Authorization: `Bearer ${process.env.PICKEM_KEY}`,
  "Content-Type": "application/json",
};

// /pick game:<id> team:<abbr>
async function pick(interaction) {
  const res = await fetch(`${API}/picks`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      discordId: interaction.user.id,
      gameId: interaction.options.getString("game"),
      team: interaction.options.getString("team"),
    }),
  });
  const body = await res.json();
  await interaction.reply({
    content: res.ok
      ? `Locked in ${body.team}${body.confidence ? ` for ${body.confidence} points` : ""}.`
      : body.error,
    ephemeral: true,
  });
}
```

Reply ephemerally to pick commands so friends don't see picks before kickoff.
