import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { reportError } from "#/lib/connection";

export function getContext() {
	const queryClient = new QueryClient({
		// A request that can't reach the server flips the app into offline mode.
		queryCache: new QueryCache({ onError: reportError }),
		mutationCache: new MutationCache({ onError: reportError }),
	});

	return {
		queryClient,
	};
}
export default function TanstackQueryProvider() {}
