import { createBrowserClient } from "@supabase/ssr";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null until VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set. */
export const supabase =
	url && anonKey ? createBrowserClient(url, anonKey) : null;
