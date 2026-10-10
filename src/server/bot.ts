import type { SupabaseClient } from "@supabase/supabase-js";
import type { Game, Team } from "#/lib/nfl/types";
import type { ScoringMode } from "#/lib/scoring";
import { getSupabaseAdminClient } from "#/lib/supabase.server";

/**
 * Bot API: a read-only view of a league's games for a Discord bot (or any
 * script) holding the league's API key. It reads with the secret key, so it
 * applies the app's rule itself: picks stay hidden until a game kicks off.
 */

export const KEY_PREFIX = "pickem_";

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export interface BotLeague {
	id: string;
	name: string;
	season: number;
	mode: ScoringMode;
	settings: { pushValue?: number };
}

export interface BotContext {
	admin: SupabaseClient;
	league: BotLeague;
}

export async function hashKey(key: string) {
	const bytes = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(key),
	);
	return [...new Uint8Array(bytes)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** A new random key; only its hash and first few characters are stored. */
export async function generateKey() {
	const raw = crypto.getRandomValues(new Uint8Array(24));
	const key =
		KEY_PREFIX +
		btoa(String.fromCharCode(...raw))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
	return {
		key,
		prefix: key.slice(0, KEY_PREFIX.length + 4),
		hash: await hashKey(key),
	};
}

/** Checks the request's `Authorization: Bearer <key>` and loads its league. */
export async function authenticate(request: Request): Promise<BotContext> {
	const header = request.headers.get("authorization") ?? "";
	const key = header.match(/^Bearer\s+(\S+)$/i)?.[1];
	if (!key?.startsWith(KEY_PREFIX))
		throw new ApiError(401, "Missing or malformed API key.");
	const admin = getSupabaseAdminClient();
	if (!admin) throw new ApiError(503, "The bot API is not configured.");

	const { data: row } = await admin
		.from("bot_keys")
		.select("id, leagues(id, name, season, mode, settings)")
		.eq("key_hash", await hashKey(key))
		.is("revoked_at", null)
		.maybeSingle();
	const league = row?.leagues as unknown as BotLeague | null;
	if (!row || !league)
		throw new ApiError(401, "That API key is invalid or was revoked.");
	await admin
		.from("bot_keys")
		.update({ last_used_at: new Date().toISOString() })
		.eq("id", row.id);
	return { admin, league };
}

export interface BotMember {
	userId: string;
	displayName: string;
	discordId: string | null;
	role: "commissioner" | "member";
}

export async function leagueMembers({
	admin,
	league,
}: BotContext): Promise<BotMember[]> {
	const [{ data: members }, { data: linked }] = await Promise.all([
		admin
			.from("league_members")
			.select("user_id, role, profiles(display_name)")
			.eq("league_id", league.id),
		admin.rpc("league_discord_ids", { p_league: league.id }),
	]);
	const discord = new Map(
		((linked ?? []) as { user_id: string; discord_id: string }[]).map((r) => [
			r.user_id,
			r.discord_id,
		]),
	);
	return (members ?? []).map((m) => ({
		userId: m.user_id,
		role: m.role,
		displayName:
			(m.profiles as unknown as { display_name: string } | null)
				?.display_name ?? "Player",
		discordId: discord.get(m.user_id) ?? null,
	}));
}

export interface PickRow {
	user_id: string;
	game_id: string;
	team: string;
	confidence: number | null;
}

/** Picks on games that have kicked off; the rest stay hidden, as in the app. */
export function visiblePicks(
	picks: PickRow[],
	games: Pick<Game, "id" | "kickoff">[],
	now = new Date(),
) {
	const started = new Set(
		games.filter((g) => new Date(g.kickoff) <= now).map((g) => g.id),
	);
	return picks.filter((p) => started.has(p.game_id));
}

/** Runs a bot endpoint: authenticates, and turns errors into JSON responses. */
export function botHandler(
	fn: (ctx: BotContext, request: Request) => Promise<unknown>,
) {
	return async ({ request }: { request: Request }) => {
		try {
			const ctx = await authenticate(request);
			return Response.json(await fn(ctx, request));
		} catch (err) {
			if (err instanceof ApiError)
				return Response.json({ error: err.message }, { status: err.status });
			console.error("bot api failed", err);
			return Response.json({ error: "Something went wrong." }, { status: 500 });
		}
	};
}

function teamView(t: Team, score: number) {
	return {
		abbr: t.abbr,
		name: t.name,
		shortName: t.shortName,
		record: t.record ?? null,
		logo: t.logo,
		score,
	};
}

/**
 * Games as the bot sees them: teams, line, ESPN public %, everyone's picks
 * once a game kicks off, and who still has to pick.
 */
export async function gameViews(ctx: BotContext, games: Game[]) {
	const { admin, league } = ctx;
	const ids = games.map((g) => g.id);
	const [members, { data: picks }, { data: locked }] = await Promise.all([
		leagueMembers(ctx),
		admin
			.from("picks")
			.select("user_id, game_id, team, confidence")
			.eq("league_id", league.id)
			.in("game_id", ids),
		admin.from("games").select("id, locked_spread").in("id", ids),
	]);
	const byUser = new Map(members.map((m) => [m.userId, m]));
	const lockedSpread = new Map(
		(locked ?? []).map((r) => [r.id, r.locked_spread as number | null]),
	);
	const all = (picks ?? []) as PickRow[];
	const shown = visiblePicks(all, games);
	const now = new Date();
	const person = (userId: string) => ({
		displayName: byUser.get(userId)?.displayName ?? "Player",
		discordId: byUser.get(userId)?.discordId ?? null,
	});

	return games.map((g) => {
		// Who has picked is fine to share before kickoff; what they picked isn't.
		const picked = new Set(
			all.filter((p) => p.game_id === g.id).map((p) => p.user_id),
		);
		return {
			id: g.id,
			week: g.week,
			kickoff: g.kickoff,
			locked: new Date(g.kickoff) <= now,
			state: g.state,
			status: g.statusText,
			away: teamView(g.away, g.awayScore),
			home: teamView(g.home, g.homeScore),
			// Home team's line (negative = home favored); frozen at kickoff.
			spread: lockedSpread.get(g.id) ?? g.spread,
			spreadText: g.spreadText,
			// Share of ESPN Pick'em players picking each side, when ESPN has it.
			publicPicks: g.publicPicks ?? null,
			picks: shown
				.filter((p) => p.game_id === g.id)
				.map((p) => ({
					...person(p.user_id),
					team: p.team,
					confidence: p.confidence,
				})),
			notPicked: members
				.filter((m) => !picked.has(m.userId))
				.map((m) => person(m.userId)),
		};
	});
}
