import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { survivorPoolQuery } from "#/server/survivor";

/** Header link to the survivor side game, shown once the commissioner turns it on. */
export function SurvivorLink({ leagueId }: { leagueId: string }) {
	const { data: pool } = useQuery(survivorPoolQuery(leagueId));
	if (!pool) return null;
	return (
		<Link
			to="/league/$leagueId/survivor"
			params={{ leagueId }}
			className="flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors hover:bg-muted sm:px-4"
		>
			<Shield className="size-4" aria-hidden />
			Survivor
		</Link>
	);
}
