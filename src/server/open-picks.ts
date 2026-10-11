import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { summarizeOpenPicks } from "#/lib/open-picks";
import { getSupabaseServerClient } from "#/lib/supabase.server";
import {
	type SurvivorGame,
	type SurvivorPick,
	survivorState,
	usedTeams,
} from "#/lib/survivor";
import { openPicks } from "./reminders";
import { survivorWeek } from "./survivor-week";
import { syncWeek } from "./sync";

/**
 * Your open picks this week across every league: games that haven't kicked
 * off and you haven't picked (the same count the pick reminders use), plus a
 * survivor pick wherever you're still alive and haven't made one.
 */
export const getOpenPicks = createServerFn({ method: "GET" }).handler(
	async () => {
		const sb = getSupabaseServerClient();
		const { data: auth } = await sb.auth.getUser();
		const user = auth.user;
		if (!user) return summarizeOpenPicks([]);

		const now = Date.now();
		const games = await syncWeek();
		const ahead = games.filter(
			(g) => g.state === "pre" && Date.parse(g.kickoff) > now,
		);
		if (!ahead.length) return summarizeOpenPicks([]);
		const season = ahead[0].season;

		const { data: rows, error } = await sb
			.from("league_members")
			.select("leagues!inner(id, name, season)")
			.eq("user_id", user.id)
			.eq("leagues.season", season);
		if (error) throw new Error(error.message);
		const leagues = (rows ?? []).map(
			(r) => r.leagues as unknown as { id: string; name: string },
		);
		if (!leagues.length) return summarizeOpenPicks([]);

		const [open, survivor] = await Promise.all([
			openPicks(sb, leagues, ahead, user.id),
			openSurvivorPicks(
				leagues.map((l) => l.id),
				season,
				user.id,
				ahead,
			),
		]);
		return summarizeOpenPicks(open, survivor);
	},
);

/** Survivor leagues where you're alive with no pick yet this week. */
async function openSurvivorPicks(
	leagueIds: string[],
	season: number,
	userId: string,
	ahead: Awaited<ReturnType<typeof syncWeek>>,
) {
	const sb = getSupabaseServerClient();
	const { data: pools } = await sb
		.from("survivor_pools")
		.select("league_id, start_week")
		.in("league_id", leagueIds)
		.eq("season", season);
	if (!pools?.length) return [];

	const { currentWeek, currentWeekClosed } = await survivorWeek(sb, season);
	const live = pools.filter((p) => p.start_week <= currentWeek);
	if (!live.length || currentWeekClosed) return [];

	const ids = live.map((p) => p.league_id as string);
	const [{ data: members }, { data: picks, error }] = await Promise.all([
		sb.from("league_members").select("league_id, user_id").in("league_id", ids),
		sb
			.from("survivor_picks")
			.select(
				"league_id, user_id, week, team, games(state, home_team, away_team, home_score, away_score)",
			)
			.in("league_id", ids)
			.eq("season", season),
	]);
	if (error) throw new Error(error.message);

	return live.flatMap((pool) => {
		const leagueId = pool.league_id as string;
		const leaguePicks: SurvivorPick[] = (picks ?? [])
			.filter((p) => p.league_id === leagueId)
			.map((p) => ({
				user_id: p.user_id,
				week: p.week,
				team: p.team,
				game: (p.games as unknown as SurvivorGame | null) ?? null,
			}));
		if (leaguePicks.some((p) => p.user_id === userId && p.week === currentWeek))
			return [];
		const state = survivorState({
			entrants: (members ?? [])
				.filter((m) => m.league_id === leagueId)
				.map((m) => m.user_id),
			picks: leaguePicks,
			startWeek: pool.start_week,
			currentWeek,
			currentWeekClosed,
		});
		const me = state.players.find((p) => p.userId === userId);
		if (!me?.alive || state.winners.length) return [];
		// Games where you could still take a team you haven't used.
		const used = usedTeams(leaguePicks, userId);
		const games = ahead.filter(
			(g) => !used.has(g.home.abbr) || !used.has(g.away.abbr),
		);
		return [{ leagueId, games }];
	});
}

export const openPicksQuery = () =>
	queryOptions({
		queryKey: ["open-picks"],
		queryFn: () => getOpenPicks(),
		refetchInterval: 5 * 60_000,
	});
