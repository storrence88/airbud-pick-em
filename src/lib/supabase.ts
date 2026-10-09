import { createBrowserClient } from "@supabase/ssr";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as
	| string
	| undefined;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env
	.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Browser client; null until the Supabase env vars are set. */
export const supabase =
	typeof window !== "undefined" && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
		? createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
		: null;
