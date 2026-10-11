import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { survivorPoolQuery } from "#/server/survivor";
import { NewDot, useNewDot } from "./NewDot";

/** Header link to the survivor side game, shown once the commissioner turns it on. */
export function SurvivorLink({ leagueId }: { leagueId: string }) {
	const { data: pool } = useQuery(survivorPoolQuery(leagueId));
	const dot = useNewDot("survivor", !!pool);
	if (!pool) return null;
	return (
		<Link
			to="/league/$leagueId/survivor"
			params={{ leagueId }}
			onClick={dot.dismiss}
			className="relative flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors hover:bg-muted sm:px-4"
		>
			<Shield className="size-4" aria-hidden />
			Survivor
			<NewDot show={dot.show} />
		</Link>
	);
}
