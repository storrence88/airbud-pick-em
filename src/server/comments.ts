import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
	isValidReaction,
	MAX_COMMENT,
	mentionedIds,
	type ReactionRow,
} from "#/lib/comments";
import { getSupabaseServerClient } from "#/lib/supabase.server";

export interface CommentRow {
	id: string;
	game_id: string;
	author_id: string;
	body: string;
	created_at: string;
	reactions: ReactionRow[];
}

/** Someone @mentioned you, for the notifications bell. */
export interface MentionNote {
	comment_id: string;
	seen: boolean;
	created_at: string;
	body: string;
	author_id: string;
	author_name: string;
	league_id: string;
	league_name: string;
	game_id: string;
	week: number;
	matchup: string;
}

async function requireUser() {
	const sb = getSupabaseServerClient();
	const { data } = await sb.auth.getUser();
	if (!data.user) throw new Error("Please sign in first.");
	return { sb, user: data.user };
}

const gameIds = z.array(z.string().max(20)).max(40);

/** Every comment on this week's games in one league, oldest first. */
export const getWeekComments = createServerFn({ method: "GET" })
	.inputValidator(z.object({ leagueId: z.string().uuid(), gameIds }))
	.handler(async ({ data }): Promise<CommentRow[]> => {
		if (!data.gameIds.length) return [];
		const { sb } = await requireUser();
		const { data: rows, error } = await sb
			.from("comments")
			.select(
				"id, game_id, author_id, body, created_at, comment_reactions(user_id, emoji)",
			)
			.eq("league_id", data.leagueId)
			.in("game_id", data.gameIds)
			.order("created_at", { ascending: true });
		if (error) throw new Error(error.message);
		return (rows ?? []).map(({ comment_reactions, ...c }) => ({
			...c,
			reactions: comment_reactions ?? [],
		}));
	});

export const weekCommentsQuery = (leagueId: string, ids: string[]) =>
	queryOptions({
		queryKey: ["comments", leagueId, ids.join(",")],
		queryFn: () => getWeekComments({ data: { leagueId, gameIds: ids } }),
		// Five friends talking: a gentle refresh keeps it feeling live.
		refetchInterval: 20_000,
	});

export const postComment = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			gameId: z.string().max(20),
			body: z.string().trim().min(1).max(MAX_COMMENT),
		}),
	)
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		const { data: comment, error } = await sb
			.from("comments")
			.insert({
				league_id: data.leagueId,
				game_id: data.gameId,
				author_id: user.id,
				body: data.body,
			})
			.select("id")
			.single();
		if (error) throw new Error(error.message);
		// Read mentions from the saved text against the real roster, so the
		// browser can't notify people outside the league.
		const { data: members } = await sb
			.from("league_members")
			.select("user_id, profiles(display_name)")
			.eq("league_id", data.leagueId);
		const ids = mentionedIds(
			data.body,
			(members ?? []).map((m) => ({
				user_id: m.user_id,
				display_name:
					(m.profiles as unknown as { display_name: string } | null)
						?.display_name ?? "",
			})),
			user.id,
		);
		if (ids.length) {
			// The comment is already saved; a failed notification shouldn't
			// make it look like it wasn't.
			const { error: mErr } = await sb
				.from("comment_mentions")
				.insert(ids.map((id) => ({ comment_id: comment.id, user_id: id })));
			if (mErr) console.error("comment mentions", mErr.message);
		}
		return { id: comment.id as string };
	});

export const deleteComment = createServerFn({ method: "POST" })
	.inputValidator(z.object({ commentId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error, count } = await sb
			.from("comments")
			.delete({ count: "exact" })
			.eq("id", data.commentId);
		if (error) throw new Error(error.message);
		if (!count) throw new Error("You can only delete your own comments.");
	});

export const setReaction = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			commentId: z.string().uuid(),
			emoji: z.string().refine(isValidReaction),
			on: z.boolean(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		const row = { comment_id: data.commentId, user_id: user.id };
		const { error } = data.on
			? await sb
					.from("comment_reactions")
					.upsert({ ...row, emoji: data.emoji }, { ignoreDuplicates: true })
			: await sb
					.from("comment_reactions")
					.delete()
					.match({ ...row, emoji: data.emoji });
		if (error) throw new Error(error.message);
	});

/** Your latest @mentions across every league you're in. */
export const getMyMentions = createServerFn({ method: "GET" }).handler(
	async (): Promise<MentionNote[]> => {
		const { sb, user } = await requireUser();
		const { data, error } = await sb
			.from("comment_mentions")
			.select(
				"comment_id, seen_at, created_at, comments(body, author_id, league_id, game_id, profiles(display_name), leagues(name), games(week, home_team, away_team))",
			)
			.eq("user_id", user.id)
			.order("created_at", { ascending: false })
			.limit(30);
		if (error) throw new Error(error.message);
		type Joined = {
			body: string;
			author_id: string;
			league_id: string;
			game_id: string;
			profiles: { display_name: string } | null;
			leagues: { name: string } | null;
			games: { week: number; home_team: string; away_team: string } | null;
		};
		return (data ?? []).flatMap((m) => {
			// Gone if the comment was deleted or you've left that league.
			const c = m.comments as unknown as Joined | null;
			if (!c) return [];
			return [
				{
					comment_id: m.comment_id,
					seen: m.seen_at != null,
					created_at: m.created_at,
					body: c.body,
					author_id: c.author_id,
					author_name: c.profiles?.display_name ?? "Someone",
					league_id: c.league_id,
					league_name: c.leagues?.name ?? "",
					game_id: c.game_id,
					week: c.games?.week ?? 0,
					matchup: c.games ? `${c.games.away_team} @ ${c.games.home_team}` : "",
				},
			];
		});
	},
);

export const myMentionsQuery = () =>
	queryOptions({
		queryKey: ["mentions"],
		queryFn: () => getMyMentions(),
		refetchInterval: 60_000,
	});

/** Marks your mentions seen: all of them, or just the ones on one game. */
export const markMentionsSeen = createServerFn({ method: "POST" })
	.inputValidator(z.object({ commentIds: z.array(z.string().uuid()).max(100) }))
	.handler(async ({ data }) => {
		if (!data.commentIds.length) return;
		const { sb, user } = await requireUser();
		const { error } = await sb
			.from("comment_mentions")
			.update({ seen_at: new Date().toISOString() })
			.eq("user_id", user.id)
			.is("seen_at", null)
			.in("comment_id", data.commentIds);
		if (error) throw new Error(error.message);
	});
