import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withPublicPicks } from "#/lib/nfl/espn-pickem";
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

export interface Member {
	user_id: string;
	role: "commissioner" | "member";
	display_name: string;
}

export interface PickRow {
	user_id: string;
	game_id: string;
	team: string;
	confidence: number | null;
}

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
		const [{ data: members }, { data: picks }] = await Promise.all([
			sb
				.from("league_members")
				.select("user_id, role, profiles(display_name)")
				.eq("league_id", data.leagueId),
			sb
				.from("picks")
				.select("user_id, game_id, team, confidence")
				.eq("league_id", data.leagueId)
				.in("game_id", gameIds),
		]);
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
			members: (members ?? []).map((m) => ({
				user_id: m.user_id,
				role: m.role,
				display_name:
					(m.profiles as unknown as { display_name: string } | null)
						?.display_name ?? "Player",
			})) as Member[],
			picks: (picks ?? []) as PickRow[],
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
		const { data: games } = await sb
			.from("games")
			.select(
				"id, week, home_team, away_team, home_score, away_score, state, locked_spread",
			)
			.eq("season", league?.season ?? seasonFor())
			.eq("state", "post");
		const ids = (games ?? []).map((g) => g.id);
		const { data: picks } = ids.length
			? await sb
					.from("picks")
					.select("user_id, game_id, team, confidence")
					.eq("league_id", data.leagueId)
					.in("game_id", ids)
			: { data: [] };
		return { games: games ?? [], picks: (picks ?? []) as PickRow[] };
	});

export const standingsQuery = (leagueId: string) =>
	queryOptions({
		queryKey: ["league", leagueId, "standings"],
		queryFn: () => getStandingsData({ data: { leagueId } }),
	});
