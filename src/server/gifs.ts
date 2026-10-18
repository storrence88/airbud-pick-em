import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GIF_ID } from "#/lib/comments";
import { getSupabaseServerClient } from "#/lib/supabase.server";

export interface Gif {
	id: string;
	title: string;
	width: number;
	height: number;
}

export interface GifResults {
	/** False until GIPHY_API_KEY is set in Vercel. */
	enabled: boolean;
	gifs: Gif[];
}

interface GiphyGif {
	id: string;
	title?: string;
	images?: { fixed_width?: { width?: string; height?: string } };
}

/** GIPHY search, or what's trending when there's no search. The key stays on the server. */
export const searchGifs = createServerFn({ method: "GET" })
	.inputValidator(z.object({ q: z.string().trim().max(50) }))
	.handler(async ({ data }): Promise<GifResults> => {
		const key = process.env.GIPHY_API_KEY;
		if (!key) return { enabled: false, gifs: [] };
		const { data: auth } = await getSupabaseServerClient().auth.getUser();
		if (!auth.user) throw new Error("Please sign in first.");
		const params = new URLSearchParams({
			api_key: key,
			limit: "24",
			rating: "pg-13",
			bundle: "messaging_non_clips",
		});
		if (data.q) params.set("q", data.q);
		const res = await fetch(
			`https://api.giphy.com/v1/gifs/${data.q ? "search" : "trending"}?${params}`,
		);
		if (!res.ok) throw new Error("GIPHY isn't answering. Try again.");
		const body = (await res.json()) as { data?: GiphyGif[] };
		return {
			enabled: true,
			gifs: (body.data ?? []).flatMap((g) => {
				const w = Number(g.images?.fixed_width?.width);
				const h = Number(g.images?.fixed_width?.height);
				if (!GIF_ID.test(g.id) || !w || !h) return [];
				return [{ id: g.id, title: g.title ?? "", width: w, height: h }];
			}),
		};
	});

export const gifSearchQuery = (q: string) =>
	queryOptions({
		queryKey: ["gifs", q],
		queryFn: () => searchGifs({ data: { q } }),
		staleTime: 5 * 60_000,
	});
