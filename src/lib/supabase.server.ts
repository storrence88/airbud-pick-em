import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getCookies, setCookie } from "@tanstack/react-start/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase";

function requireConfig() {
	if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY)
		throw new Error(
			"Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY",
		);
	return { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY };
}

/** Per-request client acting as the signed-in user (RLS applies). */
export function getSupabaseServerClient() {
	const { url, key } = requireConfig();
	return createServerClient(url, key, {
		cookies: {
			getAll: () =>
				Object.entries(getCookies()).map(([name, value]) => ({ name, value })),
			setAll: (cookies) => {
				for (const c of cookies) setCookie(c.name, c.value, c.options);
			},
		},
	});
}

/** Server-only client that bypasses RLS; used to sync NFL games. */
export function getSupabaseAdminClient() {
	const secret = process.env.SUPABASE_SECRET_KEY;
	if (!SUPABASE_URL || !secret) return null;
	return createClient(SUPABASE_URL, secret, {
		auth: { persistSession: false },
	});
}

export const isSupabaseConfigured = () =>
	Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
