import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Game } from "#/lib/nfl/types";
import { PUBLIC_PROFILE_COLUMNS, type PublicProfile } from "#/lib/profile";
import { getSupabaseServerClient } from "#/lib/supabase.server";
import {
	SURVIVOR_LAST_WEEK,
	type SurvivorGame,
	type SurvivorPick,
	type SurvivorState,
	survivorState,
} from "#/lib/survivor";
import { survivorWeek } from "./survivor-week";

export interface SurvivorPool {
	league_id: string;
	season: number;
	start_week: number;
}

export interface SurvivorEntrant extends PublicProfile {
	user_id: string;
}

export type SurvivorPickRow = SurvivorPick & { game_id: string };

async function requireUser() {
	const sb = getSupabaseServerClient();
	const { data } = await sb.auth.getUser();
	if (!data.user) throw new Error("Please sign in first.");
	return { sb, user: data.user };
}

function toEntrant(id: string, p: Partial<PublicProfile> | null) {
	return {
		user_id: id,
		display_name: p?.display_name ?? "Player",
		avatar_url: p?.avatar_url ?? null,
		avatar_kind: p?.avatar_kind ?? "photo",
		favorite_team: p?.favorite_team ?? null,
		title: p?.title ?? null,
	} as SurvivorEntrant;
}

/** Whether survivor is on, for the league page's link. Cheap: no ESPN call. */
export const getSurvivorPool = createServerFn({ method: "GET" })
	.inputValidator(z.object({ leagueId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { data: pool, error } = await sb
			.from("survivor_pools")
			.select("league_id, season, start_week")
			.eq("league_id", data.leagueId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		return (pool as SurvivorPool | null) ?? null;
	});

export const survivorPoolQuery = (leagueId: string) =>
	queryOptions({
		queryKey: ["league", leagueId, "survivor", "pool"],
		queryFn: () => getSurvivorPool({ data: { leagueId } }),
	});

/** Everything the survivor page needs: this week's games, every pick you can see, and who's alive. */
export const getSurvivor = createServerFn({ method: "GET" })
	.inputValidator(z.object({ leagueId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		const [
			{ data: league, error: leagueError },
			{ data: pool, error: poolError },
			{ data: roster, error: rosterError },
		] = await Promise.all([
			sb
				.from("leagues")
				.select("id, name, season")
				.eq("id", data.leagueId)
				.maybeSingle(),
			sb
				.from("survivor_pools")
				.select("league_id, season, start_week")
				.eq("league_id", data.leagueId)
				.maybeSingle(),
			sb
				.from("league_members")
				.select(`user_id, role, profiles(${PUBLIC_PROFILE_COLUMNS})`)
				.eq("league_id", data.leagueId)
				.order("joined_at"),
		]);
		const failed = leagueError ?? poolError ?? rosterError;
		if (failed) throw new Error(failed.message);
		if (!league) throw new Error("League not found, or you are not a member.");

		const members = (roster ?? []).map((m) =>
			toEntrant(m.user_id, m.profiles as unknown as PublicProfile | null),
		);
		const isCommissioner = (roster ?? []).some(
			(m) => m.user_id === user.id && m.role === "commissioner",
		);
		const season = (pool?.season as number | undefined) ?? league.season;

		const { currentWeek, weekGames, currentWeekClosed, started } =
			await survivorWeek(sb, season);
		// Turning survivor on starts with the next week nobody has played yet.
		const nextStart = started ? currentWeek + 1 : currentWeek;
		const nextStartWeek =
			nextStart >= 1 && nextStart <= SURVIVOR_LAST_WEEK ? nextStart : null;

		const base = {
			userId: user.id,
			league: { id: league.id as string, name: league.name as string },
			isCommissioner,
			members,
			nextStartWeek,
			currentWeek,
		};
		if (!pool)
			return {
				...base,
				pool: null as SurvivorPool | null,
				games: [] as Game[],
				picks: [] as SurvivorPickRow[],
				formers: [] as SurvivorEntrant[],
				state: null as SurvivorState | null,
			};

		const { data: rows, error: picksError } = await sb
			.from("survivor_picks")
			.select(
				"user_id, week, team, game_id, games(state, home_team, away_team, home_score, away_score)",
			)
			.eq("league_id", data.leagueId)
			.eq("season", season)
			.order("week");
		if (picksError) throw new Error(picksError.message);
		const picks: SurvivorPickRow[] = (rows ?? []).map((r) => ({
			user_id: r.user_id,
			week: r.week,
			team: r.team,
			game_id: r.game_id,
			game: (r.games as unknown as SurvivorGame | null) ?? null,
		}));

		// Survivor picks kept from members who left or were removed.
		const inLeague = new Set(members.map((m) => m.user_id));
		const formerIds = [
			...new Set(picks.map((p) => p.user_id).filter((id) => !inLeague.has(id))),
		];
		const { data: formerProfiles } = formerIds.length
			? await sb
					.from("profiles")
					.select(`id, ${PUBLIC_PROFILE_COLUMNS}`)
					.in("id", formerIds)
			: { data: [] };
		const formers = (formerProfiles ?? []).map((p) =>
			toEntrant(p.id as string, p as unknown as PublicProfile),
		);

		const state = survivorState({
			entrants: members.map((m) => m.user_id),
			picks: picks.filter((p) => inLeague.has(p.user_id)),
			startWeek: pool.start_week,
			currentWeek,
			currentWeekClosed,
		});

		return {
			...base,
			pool: pool as SurvivorPool | null,
			games: weekGames,
			picks,
			formers,
			state: state as SurvivorState | null,
		};
	});

export const survivorQuery = (leagueId: string) =>
	queryOptions({
		queryKey: ["league", leagueId, "survivor"],
		queryFn: () => getSurvivor({ data: { leagueId } }),
		refetchInterval: 30_000,
	});

/** Saves or swaps this week's survivor pick. The DB rejects used teams and started games. */
export const saveSurvivorPick = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			gameId: z.string(),
			team: z.string().min(2).max(4),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb.rpc("save_survivor_pick", {
			p_league: data.leagueId,
			p_game: data.gameId,
			p_team: data.team,
		});
		if (error) throw new Error(error.message);
	});

/** Turns survivor on from a start week, or off (which clears every survivor pick). */
export const setSurvivor = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			on: z.boolean(),
			startWeek: z.number().int().min(1).max(SURVIVOR_LAST_WEEK).nullable(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb.rpc("set_survivor", {
			p_league: data.leagueId,
			p_on: data.on,
			p_start_week: data.startWeek,
		});
		if (error)
			throw new Error(
				error.code === "42501"
					? "Only the league commissioner can turn survivor on or off."
					: error.message,
			);
	});
