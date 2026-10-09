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

export interface PickRow {
	user_id: string;
	game_id: string;
	team: string;
	confidence: number | null;
	is_lock: boolean;
}

export interface TrashTalk {
	user_id: string;
	body: string;
}

const PICK_COLUMNS = "user_id, game_id, team, confidence, is_lock";

async function requireUser() {
	const sb = getSupabaseServerClient();
	const { data } = await sb.auth.getUser();
	if (!data.user) throw new Error("Please sign in first.");
	return { sb, user: data.user };
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
			week: z.number().int().optional(),
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
				.select(`user_id, role, profiles(${PUBLIC_PROFILE_COLUMNS})`)
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
		const { data: locked } = await sb
			.from("games")
			.select("id, locked_spread")
			.in("id", gameIds);
		const lockedById = Object.fromEntries(
			(locked ?? []).map((r) => [r.id, r.locked_spread as number | null]),
		);

		return {
			userId: user.id,
			league: league as League,
			games: games.map((g) => ({
				...g,
				lockedSpread: lockedById[g.id] ?? null,
			})),
			members: (members ?? []).map((m) => {
				const p = m.profiles as unknown as PublicProfile | null;
				return {
					user_id: m.user_id,
					role: m.role,
					display_name: p?.display_name ?? "Player",
					avatar_url: p?.avatar_url ?? null,
					avatar_kind: p?.avatar_kind ?? "photo",
					favorite_team: p?.favorite_team ?? null,
					title: p?.title ?? null,
				};
			}) as Member[],
			picks: (picks ?? []) as PickRow[],
			trashTalk: {
				season,
				week,
				/** When everyone's lines show; null until the week's games are known. */
				revealAt: (reveal as string | null) ?? null,
				lines: (talk ?? []) as TrashTalk[],
			},
		};
	});

export const leagueWeekQuery = (leagueId: string, week?: number) =>
	queryOptions({
		queryKey: ["league", leagueId, "week", week ?? "current"],
		queryFn: () => getLeagueWeek({ data: { leagueId, week } }),
		refetchInterval: 30_000,
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
		return { games, weeks, picks };
	});

export const standingsQuery = (leagueId: string) =>
	queryOptions({
		queryKey: ["league", leagueId, "standings"],
		queryFn: () => getStandingsData({ data: { leagueId } }),
	});
