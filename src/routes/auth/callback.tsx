import { createFileRoute } from "@tanstack/react-router";
import { authErrorMessage } from "#/lib/auth-errors";
import { getSupabaseServerClient } from "#/lib/supabase.server";

/** Magic-link landing: swaps the one-time code for a session cookie. */
export const Route = createFileRoute("/auth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const url = new URL(request.url);
				const toLogin = (message: string) =>
					new Response(null, {
						status: 302,
						headers: {
							Location: `/login?error=${encodeURIComponent(message)}`,
						},
					});
				const linkError = authErrorMessage(url.searchParams);
				if (linkError) return toLogin(linkError);
				const code = url.searchParams.get("code");
				const next = url.searchParams.get("next");
				// Only allow same-site relative redirects.
				const dest =
					next?.startsWith("/") && !next.startsWith("//") ? next : "/leagues";
				if (code) {
					const { error } =
						await getSupabaseServerClient().auth.exchangeCodeForSession(code);
					if (error)
						return toLogin(
							"That sign-in link didn't work. Send yourself a new one from this browser.",
						);
				}
				return new Response(null, { status: 302, headers: { Location: dest } });
			},
		},
	},
});
