import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseServerClient } from "#/lib/supabase.server";
import { generateKey } from "./bot";

export interface BotKey {
	id: string;
	name: string;
	key_prefix: string;
	created_at: string;
	last_used_at: string | null;
}

async function requireUser() {
	const sb = getSupabaseServerClient();
	const { data } = await sb.auth.getUser();
	if (!data.user) throw new Error("Please sign in first.");
	return { sb, user: data.user };
}

/** Active API keys for a league. RLS limits this to the commissioner. */
export const listBotKeys = createServerFn({ method: "GET" })
	.inputValidator(z.object({ leagueId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { data: keys, error } = await sb
			.from("bot_keys")
			.select("id, name, key_prefix, created_at, last_used_at")
			.eq("league_id", data.leagueId)
			.is("revoked_at", null)
			.order("created_at", { ascending: false });
		if (error) throw new Error(error.message);
		return (keys ?? []) as BotKey[];
	});

export const botKeysQuery = (leagueId: string) =>
	queryOptions({
		queryKey: ["league", leagueId, "bot-keys"],
		queryFn: () => listBotKeys({ data: { leagueId } }),
	});

/** Creates a key and returns it. This is the only time the full key is shown. */
export const createBotKey = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			leagueId: z.string().uuid(),
			name: z.string().trim().min(1).max(40),
		}),
	)
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		const { key, prefix, hash } = await generateKey();
		const { error } = await sb.from("bot_keys").insert({
			league_id: data.leagueId,
			name: data.name,
			key_hash: hash,
			key_prefix: prefix,
			created_by: user.id,
		});
		if (error)
			throw new Error(
				error.code === "42501"
					? "Only the league commissioner can create bot keys."
					: error.message,
			);
		return key;
	});

export const revokeBotKey = createServerFn({ method: "POST" })
	.inputValidator(z.object({ id: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { sb } = await requireUser();
		const { error } = await sb
			.from("bot_keys")
			.update({ revoked_at: new Date().toISOString() })
			.eq("id", data.id);
		if (error) throw new Error(error.message);
	});
