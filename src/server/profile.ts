import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { NFL_TEAMS } from "#/lib/nfl/teams";
import {
	isAllowedAvatarUrl,
	LOSS_EFFECTS,
	MAX_NAME,
	MAX_TITLE,
	MY_PROFILE_COLUMNS,
	type MyProfile,
	WIN_EFFECTS,
} from "#/lib/profile";
import { SUPABASE_URL } from "#/lib/supabase";
import { getSupabaseServerClient } from "#/lib/supabase.server";

async function requireUser() {
	const sb = getSupabaseServerClient();
	const { data } = await sb.auth.getUser();
	if (!data.user) throw new Error("Please sign in first.");
	return { sb, user: data.user };
}

export const getMyProfile = createServerFn({ method: "GET" }).handler(
	async () => {
		const { sb, user } = await requireUser();
		const { data, error } = await sb
			.from("profiles")
			.select(MY_PROFILE_COLUMNS)
			.eq("id", user.id)
			.single();
		if (error) throw new Error(error.message);
		const discord = user.user_metadata?.avatar_url;
		const hasDiscord = Boolean(
			user.identities?.some((i) => i.provider === "discord"),
		);
		return {
			userId: user.id,
			profile: data as unknown as MyProfile,
			/** Offered as an avatar choice for Discord sign-ins. */
			discordAvatar:
				typeof discord === "string" &&
				discord.startsWith("https://cdn.discordapp.com/")
					? discord
					: null,
			/** Discord DM reminders need a Discord sign-in. */
			hasDiscord,
		};
	},
);

export const myProfileQuery = () =>
	queryOptions({ queryKey: ["profile"], queryFn: () => getMyProfile() });

const teamAbbrs = NFL_TEAMS.map((t) => t.abbr) as [string, ...string[]];
const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((s) => s || null)
		.nullable();

export const updateProfile = createServerFn({ method: "POST" })
	.inputValidator(
		z
			.object({
				display_name: z.string().trim().min(1).max(MAX_NAME),
				title: optionalText(MAX_TITLE),
				favorite_team: z.enum(teamAbbrs).nullable(),
				team_theme: z.boolean(),
				avatar_kind: z.enum(["photo", "monogram"]),
				avatar_url: z.string().url().max(500).nullable(),
				win_effect: z.enum(
					Object.keys(WIN_EFFECTS) as [keyof typeof WIN_EFFECTS],
				),
				loss_effect: z.enum(
					Object.keys(LOSS_EFFECTS) as [keyof typeof LOSS_EFFECTS],
				),
				bot_mentions: z.boolean(),
				reminder_style: z.enum(["gentle", "roast"]),
				reminder_channel: z.enum(["email", "discord", "off"]),
			})
			.partial(),
	)
	.handler(async ({ data }) => {
		const { sb, user } = await requireUser();
		if (
			data.avatar_url &&
			!isAllowedAvatarUrl(data.avatar_url, SUPABASE_URL, user.id)
		)
			throw new Error("That avatar can't be used.");
		const { error } = await sb.from("profiles").update(data).eq("id", user.id);
		if (error) throw new Error(error.message);
	});
