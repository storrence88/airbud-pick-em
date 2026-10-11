import { createServerFn } from "@tanstack/react-start";
import { PUBLIC_PROFILE_COLUMNS, type PublicProfile } from "#/lib/profile";
import {
	getSupabaseServerClient,
	isSupabaseConfigured,
} from "#/lib/supabase.server";

export interface SessionUser {
	id: string;
	email: string;
	/** When the account was made; newer accounts get the practice week instead of What's new. */
	createdAt: string;
	displayName: string;
	profile: PublicProfile;
	/** Tint the app with the favorite team's colors. */
	teamTheme: boolean;
}

export const getSessionUser = createServerFn({ method: "GET" }).handler(
	async (): Promise<SessionUser | null> => {
		if (!isSupabaseConfigured()) return null;
		const sb = getSupabaseServerClient();
		const { data } = await sb.auth.getUser();
		if (!data.user) return null;
		const { data: row } = await sb
			.from("profiles")
			.select(`${PUBLIC_PROFILE_COLUMNS}, team_theme`)
			.eq("id", data.user.id)
			.maybeSingle();
		const profile = row as (PublicProfile & { team_theme: boolean }) | null;
		const displayName =
			profile?.display_name ?? data.user.email?.split("@")[0] ?? "Player";
		return {
			id: data.user.id,
			email: data.user.email ?? "",
			createdAt: data.user.created_at,
			displayName,
			profile: {
				display_name: displayName,
				avatar_url: profile?.avatar_url ?? null,
				avatar_kind: profile?.avatar_kind ?? "photo",
				favorite_team: profile?.favorite_team ?? null,
				title: profile?.title ?? null,
			},
			teamTheme: profile?.team_theme ?? true,
		};
	},
);

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
	await getSupabaseServerClient().auth.signOut();
});
