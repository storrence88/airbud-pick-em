import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { EMOJI_NAME } from "#/lib/comments";
import { SUPABASE_URL } from "#/lib/supabase";
import { getSupabaseServerClient } from "#/lib/supabase.server";

/** A league's own emoji, uploaded by a member (migration 0029). */
export interface LeagueEmoji {
	name: string;
	image_url: string;
	created_by: string;
}

async function requireUser() {
	const sb = getSupabaseServerClient();
	const { data } = await sb.auth.getUser();
	if (!data.user) throw new Error("Please sign in first.");
	return { sb, user: data.user };
}

/** Where a league's emoji images live in the public bucket. */
export const emojiFolderUrl = (leagueId: string) =>
	`${(SUPABASE_URL ?? "").replace(/\/$/, "")}/storage/v1/object/public/emoji/${leagueId}/`;

export const getLeagueEmoji = createServerFn({ method: "GET" })
	.inputValidator(z.object({ leagueId: z.string().uuid() }))
	.handler(async ({ data }): Promise<LeagueEmoji[]> => {
		const { sb } = await requireUser();
		const { data: rows, error } = await sb
			.from("league_emoji")
			.select("name, image_url, created_by")
			.eq("league_id", data.leagueId)
			.order("name");
		if (error) throw new Error(error.message);
		return rows ?? [];
	});

export const leagueEmojiQuery = (leagueId: string) =>
	queryOptions({
		queryKey: ["league-emoji", leagueId],
		queryFn: () => getLeagueEmoji({ data: { leagueId } }),
		staleTime: 5 * 60_000,
	});

/** Saves an emoji whose image the browser already uploaded to the bucket. */
export const addLeagueEmoji = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			name: z.string().regex(EMOJI_NAME),
			imageUrl: z.string().url(),
		}),
	)
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		// Only images in this league's folder of our own bucket.
		if (!data.imageUrl.startsWith(emojiFolderUrl(data.leagueId)))
			throw new Error("That image isn't one of ours.");
		const { error } = await sb.from("league_emoji").insert({
			league_id: data.leagueId,
			name: data.name,
			image_url: data.imageUrl,
			created_by: user.id,
		});
		if (error?.code === "23505")
			throw new Error(`:${data.name}: is taken. Try another name.`);
		if (error) throw new Error(error.message);
	});

export const removeLeagueEmoji = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			name: z.string().regex(EMOJI_NAME),
		}),
	)
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { data: rows, error } = await sb
			.from("league_emoji")
			.delete()
			.match({ league_id: data.leagueId, name: data.name })
			.select("image_url");
		if (error) throw new Error(error.message);
		if (!rows?.length)
			throw new Error(
				"Only whoever added it or the commissioner can remove it.",
			);
		const path = rows[0].image_url.split("/object/public/emoji/")[1];
		if (path) await sb.storage.from("emoji").remove([path]);
	});
