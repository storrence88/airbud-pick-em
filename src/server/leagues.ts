import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { WeekStatus } from "#/lib/flair";
import { withPublicPicks } from "#/lib/nfl/espn-pickem";
import {
	MAX_TRASH_TALK,
	PUBLIC_PROFILE_COLUMNS,
	type PublicProfile,
} from "#/lib/profile";
import type { ScoringMode } from "#/lib/scoring";
import { getSupabaseServerClient } from "#/lib/supabase.server";
import { MAX_TIEBREAKER, tiebreakerGameId } from "#/lib/tiebreaker";
import { syncWeek } from "./sync";

export interface League {
	id: string;
	name: string;
	season: number;
	mode: ScoringMode;
	invite_code: string;
	created_by: string;
	settings: { pushValue?: number };
}

export interface Member extends PublicProfile {
	user_id: string;
	role: "commissioner" | "member";
}

/** Someone removed from the league whose picks were kept. */
export interface FormerMember extends PublicProfile {
	user_id: string;
}

export interface PickRow {
	user_id: string;
	game_id: string;
	team: string;
	confidence: number | null;
	is_lock: boolean;
	/** Monday night tiebreaker guess, only on the week's last game. */
	tiebreaker: number | null;
	/** The commissioner who entered this pick for the member, if they didn't. */
	entered_by: string | null;
}

export interface TrashTalk {
	user_id: string;
	body: string;
}

const PICK_COLUMNS =
	"user_id, game_id, team, confidence, is_lock, tiebreaker, entered_by";

async function requireUser() {
	const sb = getSupabaseServerClient();
	const { data } = await sb.auth.getUser();
	if (!data.user) throw new Error("Please sign in first.");
	return { sb, user: data.user };
}

const MEMBER_COLUMNS = `user_id, role, profiles(${PUBLIC_PROFILE_COLUMNS})`;

/** A league_members row joined with its profile, as selected by MEMBER_COLUMNS. */
function toMember(m: { user_id: string; role: string; profiles: unknown }) {
	const p = m.profiles as PublicProfile | null;
	return {
		user_id: m.user_id,
		role: m.role,
		display_name: p?.display_name ?? "Player",
		avatar_url: p?.avatar_url ?? null,
		avatar_kind: p?.avatar_kind ?? "photo",
		favorite_team: p?.favorite_team ?? null,
		title: p?.title ?? null,
	} as Member;
}

/** The NFL season a date falls in (seasons start in September). */
export function seasonFor(date = new Date()) {
	return date.getUTCMonth() < 2
		? date.getUTCFullYear() - 1
		: date.getUTCFullYear();
}

export const getMyLeagues = createServerFn({ method: "GET" }).handler(
	async () => {
		const { sb, user } = await requireUser();
		const { data, error } = await sb
			.from("league_members")
			.select("role, leagues(*)")
			.eq("user_id", user.id)
			.order("joined_at", { ascending: false });
		if (error) throw new Error(error.message);
		return (data ?? []).map((r) => ({
			role: r.role as Member["role"],
			league: r.leagues as unknown as League,
		}));
	},
);

export const myLeaguesQuery = () =>
	queryOptions({ queryKey: ["leagues"], queryFn: () => getMyLeagues() });

export const createLeague = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			name: z.string().trim().min(1).max(60),
			mode: z.enum(["straight", "spread", "confidence"]),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { data: league, error } = await sb.rpc("create_league", {
			p_name: data.name,
			p_mode: data.mode,
			p_season: seasonFor(),
		});
		if (error) throw new Error(error.message);
		return league as League;
	});

export const joinLeague = createServerFn({ method: "POST" })
	.inputValidator(z.object({ code: z.string().trim().min(4).max(32) }))
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { data: id, error } = await sb.rpc("join_league", {
			p_code: data.code,
		});
		if (error) throw new Error(error.message);
		return id as string;
	});

export const getLeagueWeek = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			week: z.number().int().min(1).max(23).optional(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		const { data: league, error } = await sb
			.from("leagues")
			.select("*")
			.eq("id", data.leagueId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		if (!league) throw new Error("League not found, or you are not a member.");

		const games = await withPublicPicks(await syncWeek(data.week));
		const gameIds = games.map((g) => g.id);
		const season = games[0]?.season ?? league.season;
		const week = games[0]?.week ?? 0;
		const [
			{ data: members, error: membersError },
			{ data: picks, error: picksError },
			{ data: talk },
			{ data: reveal },
		] = await Promise.all([
			sb
				.from("league_members")
				.select(MEMBER_COLUMNS)
				.eq("league_id", data.leagueId),
			sb
				.from("picks")
				.select(PICK_COLUMNS)
				.eq("league_id", data.leagueId)
				.in("game_id", gameIds),
			// Row-level security hides other members' lines until the reveal.
			sb
				.from("trash_talk")
				.select("user_id, body")
				.eq("league_id", data.leagueId)
				.eq("season", season)
				.eq("week", week),
			sb.rpc("week_reveal_at", { p_season: season, p_week: week }),
		]);
		// An empty roster or pick list would look like lost picks, so fail loudly.
		const failed = membersError ?? picksError;
		if (failed) throw new Error(failed.message);
		// Locked spreads come from our DB so ATS uses the frozen line, not the live one.
		// "*" so the saved crowd split (migration 0018) is read when it exists.
		const { data: locked } = await sb
			.from("games")
			.select("*")
			.in("id", gameIds);
		const lockedById = new Map(
			(locked ?? []).map((r) => [
				r.id as string,
				{
					spread: r.locked_spread as number | null,
					crowd: (r.crowd_home_pct ?? null) as number | null,
				},
			]),
		);

		// Removed members' kept picks stay out of the pick board but still show
		// in the week's results, muted like the standings' "Former members".
		const roster = (members ?? []).map(toMember);
		const inLeague = new Set(roster.map((m) => m.user_id));
		const allPicks = (picks ?? []) as PickRow[];
		const formerPicks = allPicks.filter((p) => !inLeague.has(p.user_id));
		const formers = await formerProfiles(sb, formerPicks);

		return {
			userId: user.id,
			league: league as League,
			games: games.map((g) => ({
				...g,
				lockedSpread: lockedById.get(g.id)?.spread ?? null,
				/** ESPN's home share saved at lock; null until it's stored. */
				crowdHomePct: lockedById.get(g.id)?.crowd ?? null,
			})),
			members: roster,
			picks: allPicks.filter((p) => inLeague.has(p.user_id)),
			formers,
			formerPicks,
			trashTalk: {
				season,
				week,
				/** When everyone's lines show; null until the week's games are known. */
				revealAt: (reveal as string | null) ?? null,
				lines: (talk ?? []) as TrashTalk[],
			},
		};
	});

/** A week of the league. Leave out `week` for the current one; earlier weeks are finished, so they don't poll. */
export const leagueWeekQuery = (leagueId: string, week?: number) =>
	queryOptions({
		queryKey: ["league", leagueId, "week", week ?? "current"],
		queryFn: () => getLeagueWeek({ data: { leagueId, week } }),
		refetchInterval: week ? false : 30_000,
		staleTime: week ? 5 * 60_000 : 0,
	});

/** Saves a pick and returns its confidence value (assigned by the DB in confidence leagues). */
export const savePick = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			gameId: z.string(),
			team: z.string().min(2).max(4),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { data: confidence, error } = await sb.rpc("save_pick", {
			p_league: data.leagueId,
			p_game: data.gameId,
			p_team: data.team,
		});
		// RLS rejects writes after kickoff.
		if (error)
			throw new Error(
				error.code === "42501"
					? "That game has already started."
					: error.message,
			);
		return confidence as number | null;
	});

/**
 * The commissioner enters a pick a member sent in, before kickoff. In confidence
 * leagues it takes their next open value unless one is asked for. Nothing about
 * the member's other picks comes back.
 */
export const enterPickFor = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			userId: z.string().uuid(),
			gameId: z.string(),
			team: z.string().min(2).max(4),
			confidence: z.number().int().min(1).max(20).nullable(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb.rpc("enter_pick_for", {
			p_league: data.leagueId,
			p_user: data.userId,
			p_game: data.gameId,
			p_team: data.team,
			p_confidence: data.confidence,
		});
		if (error)
			throw new Error(
				error.code === "42501"
					? "Only the league commissioner can enter picks for others."
					: error.message,
			);
	});

/**
 * The commissioner brings over a finished week from Yahoo Pick'em: each listed
 * player's picks that week are replaced with the imported ones.
 */
export const importWeekPicks = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			week: z.number().int().min(1).max(18),
			rows: z
				.array(
					z.object({
						userId: z.string().uuid(),
						picks: z
							.array(
								z.object({
									gameId: z.string().max(20),
									team: z.string().min(2).max(4),
									confidence: z.number().int().min(1).max(20).nullable(),
								}),
							)
							.max(20),
						tiebreaker: z.number().int().min(0).max(MAX_TIEBREAKER).nullable(),
					}),
				)
				.min(1)
				.max(50),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		// Weeks from before the league started may not be saved yet.
		await syncWeek(data.week);
		const { data: saved, error } = await sb.rpc("import_week_picks", {
			p_league: data.leagueId,
			p_week: data.week,
			p_rows: data.rows,
		});
		if (error)
			throw new Error(
				error.code === "PGRST202"
					? "Run migration 0027 in Supabase first."
					: error.message,
			);
		return saved as number;
	});

/** Re-ranks picks in one transaction; the DB rejects any value used twice in a week. */
export const setConfidence = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			values: z
				.array(
					z.object({
						gameId: z.string(),
						confidence: z.number().int().min(1).max(20),
					}),
				)
				.max(20)
				.refine(
					(vs) => new Set(vs.map((v) => v.confidence)).size === vs.length,
					"Each confidence value can only be used once.",
				),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb.rpc("set_confidence", {
			p_league: data.leagueId,
			p_values: data.values,
		});
		if (error) throw new Error(error.message);
	});

/** Makes a pick your Lock of the Week (moving it off any other game), or clears it. */
export const setLock = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			gameId: z.string(),
			on: z.boolean(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb.rpc("set_lock", {
			p_league: data.leagueId,
			p_game: data.gameId,
			p_on: data.on,
		});
		if (error) throw new Error(error.message);
	});

/**
 * Saves (or clears) your Monday night tiebreaker guess: total points in the
 * week's last game. It lives on your pick for that game, so pick a winner
 * there first; RLS locks it at that game's kickoff.
 */
export const setTiebreaker = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			gameId: z.string(),
			points: z.number().int().min(0).max(MAX_TIEBREAKER).nullable(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		const { data: game } = await sb
			.from("games")
			.select("season, week")
			.eq("id", data.gameId)
			.maybeSingle();
		if (!game) throw new Error("Game not found.");
		const { data: week } = await sb
			.from("games")
			.select("id, kickoff")
			.eq("season", game.season)
			.eq("week", game.week);
		const weekGames = week ?? [];
		if (tiebreakerGameId(weekGames) !== data.gameId)
			throw new Error("The tiebreaker is on the week's last game.");
		const kickoff = weekGames.find((g) => g.id === data.gameId)?.kickoff;
		if (kickoff && Date.parse(kickoff) <= Date.now())
			throw new Error("That game has already started.");
		const { data: saved, error } = await sb
			.from("picks")
			.update({ tiebreaker: data.points, updated_at: new Date().toISOString() })
			.match({
				league_id: data.leagueId,
				user_id: user.id,
				game_id: data.gameId,
			})
			.select("game_id");
		if (error) throw new Error(error.message);
		if (!saved?.length) throw new Error("Pick a winner in that game first.");
		// A guess left on a game that's no longer last (schedule change) shouldn't linger.
		const others = weekGames
			.filter((g) => g.id !== data.gameId && Date.parse(g.kickoff) > Date.now())
			.map((g) => g.id);
		if (others.length)
			await sb
				.from("picks")
				.update({ tiebreaker: null })
				.eq("league_id", data.leagueId)
				.eq("user_id", user.id)
				.in("game_id", others)
				.not("tiebreaker", "is", null);
	});

/** Saves this week's trash talk line, or removes it when empty. */
export const saveTrashTalk = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			season: z.number().int(),
			week: z.number().int().min(1),
			body: z.string().trim().max(MAX_TRASH_TALK),
		}),
	)
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		const key = {
			league_id: data.leagueId,
			user_id: user.id,
			season: data.season,
			week: data.week,
		};
		const locked = "Trash talk is locked once this week's lines are out.";
		if (!data.body) {
			// RLS turns a late delete into a no-op rather than an error.
			const { data: gone, error } = await sb
				.from("trash_talk")
				.delete()
				.match(key)
				.select("user_id");
			if (error) throw new Error(error.message);
			if (!gone?.length) throw new Error(locked);
			return;
		}
		const { error } = await sb.from("trash_talk").upsert({
			...key,
			body: data.body,
			updated_at: new Date().toISOString(),
		});
		// RLS rejects writes once the week's lines are revealed.
		if (error) throw new Error(error.code === "42501" ? locked : error.message);
	});

/** Profiles of the people behind picks kept from members who left or were removed. */
async function formerProfiles(
	sb: ReturnType<typeof getSupabaseServerClient>,
	picks: PickRow[],
) {
	const ids = [...new Set(picks.map((p) => p.user_id))];
	if (!ids.length) return [];
	const { data } = await sb
		.from("profiles")
		.select(`id, ${PUBLIC_PROFILE_COLUMNS}`)
		.in("id", ids);
	return (data ?? []).map(
		({ id, ...p }) => ({ user_id: id as string, ...p }) as FormerMember,
	);
}

const PAGE = 1000;

/** Every revealed pick on finished games this season, for the standings. */
export const getStandingsData = createServerFn({ method: "GET" })
	.inputValidator(z.object({ leagueId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { data: league } = await sb
			.from("leagues")
			.select("season")
			.eq("id", data.leagueId)
			.single();
		const { data: all } = await sb
			.from("games")
			.select(
				"id, week, kickoff, home_team, away_team, home_score, away_score, state, locked_spread",
			)
			.eq("season", league?.season ?? seasonFor());
		const weeks: WeekStatus = {};
		for (const g of all ?? []) {
			const w = weeks[g.week] ?? { total: 0, final: 0 };
			w.total += 1;
			if (g.state === "post") w.final += 1;
			weeks[g.week] = w;
		}
		const games = (all ?? []).filter((g) => g.state === "post");
		const ids = games.map((g) => g.id);
		// A season of picks passes Supabase's 1000-row response cap, so page through.
		const picks: PickRow[] = [];
		for (let from = 0; ids.length; from += PAGE) {
			const { data: page, error } = await sb
				.from("picks")
				.select(PICK_COLUMNS)
				.eq("league_id", data.leagueId)
				.in("game_id", ids)
				.order("game_id")
				.order("user_id")
				.range(from, from + PAGE - 1);
			if (error) throw new Error(error.message);
			picks.push(...((page ?? []) as PickRow[]));
			if (!page || page.length < PAGE) break;
		}
		// Picks kept from removed members still count, under "Former members".
		const { data: roster, error: rosterError } = await sb
			.from("league_members")
			.select("user_id")
			.eq("league_id", data.leagueId);
		if (rosterError) throw new Error(rosterError.message);
		const inLeague = new Set((roster ?? []).map((m) => m.user_id as string));
		const formers = await formerProfiles(
			sb,
			picks.filter((p) => !inLeague.has(p.user_id)),
		);
		return { games, weeks, picks, formers };
	});

export const standingsQuery = (leagueId: string) =>
	queryOptions({
		queryKey: ["league", leagueId, "standings"],
		queryFn: () => getStandingsData({ data: { leagueId } }),
	});

export const PUSH_VALUES = [0, 0.5, 1] as const;

/** The league plus whether you can change it. Only the commissioner sees the settings form. */
export const getLeagueSettings = createServerFn({ method: "GET" })
	.inputValidator(z.object({ leagueId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		const [{ data: league, error }, { data: roster, error: rosterError }] =
			await Promise.all([
				sb.from("leagues").select("*").eq("id", data.leagueId).maybeSingle(),
				sb
					.from("league_members")
					.select(MEMBER_COLUMNS)
					.eq("league_id", data.leagueId)
					.order("joined_at"),
			]);
		if (error ?? rosterError) throw new Error((error ?? rosterError)?.message);
		if (!league) throw new Error("League not found, or you are not a member.");
		const members = (roster ?? []).map(toMember);
		const me = members.find((m) => m.user_id === user.id);
		return {
			userId: user.id,
			league: league as League,
			members,
			isCommissioner: me?.role === "commissioner",
		};
	});

export const leagueSettingsQuery = (leagueId: string) =>
	queryOptions({
		queryKey: ["league", leagueId, "settings"],
		queryFn: () => getLeagueSettings({ data: { leagueId } }),
	});

/** Renames the league and sets the push value. The DB checks you're the commissioner. */
export const updateLeagueSettings = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			name: z.string().trim().min(1).max(60),
			pushValue: z.literal(PUSH_VALUES),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { data: league, error } = await sb.rpc("update_league_settings", {
			p_league: data.leagueId,
			p_name: data.name,
			p_push_value: data.pushValue,
		});
		if (error)
			throw new Error(
				error.code === "42501"
					? "Only the league commissioner can change settings."
					: error.message,
			);
		return league as League;
	});

/** Hands the commissioner role to another member; you become a regular member. */
export const transferCommissioner = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			userId: z.string().uuid(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb.rpc("transfer_commissioner", {
			p_league: data.leagueId,
			p_new_commissioner: data.userId,
		});
		if (error)
			throw new Error(
				error.code === "42501"
					? "Only the league commissioner can transfer the role."
					: error.message,
			);
	});

/** Deletes the league and everything in it, once the name is typed to confirm. */
export const deleteLeague = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			confirmName: z.string(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb.rpc("delete_league", {
			p_league: data.leagueId,
			p_confirm_name: data.confirmName,
		});
		if (error)
			throw new Error(
				error.code === "42501"
					? "Only the league commissioner can delete the league."
					: error.message,
			);
	});

/** Kicks a member out. Keeping picks leaves their finished games in the standings. */
export const removeMember = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			userId: z.string().uuid(),
			keepPicks: z.boolean(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb.rpc("remove_member", {
			p_league: data.leagueId,
			p_user: data.userId,
			p_keep_picks: data.keepPicks,
		});
		if (error)
			throw new Error(
				error.code === "42501"
					? "Only the league commissioner can remove members."
					: error.message,
			);
	});

/** Takes the signed-in member out of a league. Their finished games stay in the standings. */
export const leaveLeague = createServerFn({ method: "POST" })
	.inputValidator(z.object({ leagueId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb.rpc("leave_league", { p_league: data.leagueId });
		if (error)
			throw new Error(
				error.code === "42501"
					? "Transfer the commissioner role before leaving the league."
					: error.message,
			);
	});

/** Swaps the invite code for a new one. The old link stops working right away. */
export const resetInviteCode = createServerFn({ method: "POST" })
	.inputValidator(z.object({ leagueId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { data: code, error } = await sb.rpc("reset_invite_code", {
			p_league: data.leagueId,
		});
		if (error)
			throw new Error(
				error.code === "42501"
					? "Only the league commissioner can reset the invite link."
					: error.message,
			);
		return code as string;
	});
