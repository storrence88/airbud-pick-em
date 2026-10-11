import { createFileRoute } from "@tanstack/react-router";

/** An empty answer the app asks for to check it can reach the server again. */
export const Route = createFileRoute("/api/ping")({
	server: {
		handlers: {
			GET: () => new Response(null, { status: 204 }),
			HEAD: () => new Response(null, { status: 204 }),
		},
	},
});
