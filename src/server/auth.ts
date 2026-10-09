import { createServerFn } from "@tanstack/react-start";
import {
	getSupabaseServerClient,
	isSupabaseConfigured,
} from "#/lib/supabase.server";

export interface SessionUser {
	id: string;
	email: string;
	displayName: string;
}

export const getSessionUser = createServerFn({ method: "GET" }).handler(
	async (): Promise<SessionUser | null> => {
		if (!isSupabaseConfigured()) return null;
		const sb = getSupabaseServerClient();
		const { data } = await sb.auth.getUser();
		if (!data.user) return null;
		const { data: profile } = await sb
			.from("profiles")
			.select("display_name")
			.eq("id", data.user.id)
			.maybeSingle();
		return {
			id: data.user.id,
			email: data.user.email ?? "",
			displayName:
				profile?.display_name ?? data.user.email?.split("@")[0] ?? "Player",
		};
	},
);

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
	await getSupabaseServerClient().auth.signOut();
});
