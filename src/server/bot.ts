import type { SupabaseClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";
import type { Game } from "#/lib/nfl/types";
import type { ScoringMode } from "#/lib/scoring";
import { getSupabaseAdminClient } from "#/lib/supabase.server";

/**
 * Bot API: a Discord bot (or any script) holding a league's API key can read
 * the league and make picks for members who signed in with Discord. Every
 * write goes through the bot_* database functions, which apply the same
 * membership, kickoff-lock and scoring-mode rules as the app.
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

const DISCORD_ID = /^\d{15,21}$/;

/** The league member whose linked Discord account has this user id. */
export async function memberForDiscord(
	{ admin, league }: BotContext,
	discordId: string,
) {
	if (!DISCORD_ID.test(discordId))
		throw new ApiError(400, "discordId must be a Discord user id (digits).");
	const { data: userId } = await admin.rpc("discord_user", {
		p_discord_id: discordId,
	});
	if (!userId)
		throw new ApiError(
			404,
			"No Pick'em account is linked to that Discord user. They need to sign in to the app with Discord once.",
		);
	const { data: member } = await admin
		.from("league_members")
		.select("user_id")
		.eq("league_id", league.id)
		.eq("user_id", userId)
		.maybeSingle();
	if (!member)
		throw new ApiError(404, "That Discord user is not in this league.");
	return userId as string;
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

/**
 * Which picks the bot may see for a week: the asking member's own picks
 * always, everyone else's only once that game has kicked off. Mirrors the
 * "read picks" RLS policy, since the bot reads with the secret key.
 */
export function visiblePicks(
	picks: PickRow[],
	games: Pick<Game, "id" | "kickoff">[],
	viewerId: string | null,
	now = new Date(),
) {
	const started = new Set(
		games.filter((g) => new Date(g.kickoff) <= now).map((g) => g.id),
	);
	return picks.filter((p) => p.user_id === viewerId || started.has(p.game_id));
}

/** Turns a database error from a bot_* function into an HTTP error. */
export function rpcError(error: { code?: string; message: string }) {
	switch (error.code) {
		case "42501": // kicked off
		case "23505": // confidence value already used
			return new ApiError(409, error.message);
		case "P0002": // not a member, unknown game, no pick yet
			return new ApiError(404, error.message);
		case "22023": // wrong team, wrong scoring mode
		case "P0001": // confidence out of range
			return new ApiError(400, error.message);
		default:
			console.error("bot api rpc failed", error);
			return new ApiError(500, "Something went wrong saving that.");
	}
}

export async function readJson<T>(request: Request, schema: ZodType<T>) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw new ApiError(400, "Send a JSON body.");
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success)
		throw new ApiError(
			400,
			parsed.error.issues
				.map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
				.join("; "),
		);
	return parsed.data;
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
