import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseServerClient } from "#/lib/supabase.server";

/** Magic-link landing: swaps the one-time code for a session cookie. */
export const Route = createFileRoute("/auth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const code = url.searchParams.get("code");
				const next = url.searchParams.get("next");
				// Only allow same-site relative redirects.
				const dest =
					next?.startsWith("/") && !next.startsWith("//") ? next : "/leagues";
				if (code) {
					const { error } =
						await getSupabaseServerClient().auth.exchangeCodeForSession(code);
					if (error)
						return Response.redirect(
							new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
							302,
						);
				}
				return new Response(null, { status: 302, headers: { Location: dest } });
			},
		},
	},
});
