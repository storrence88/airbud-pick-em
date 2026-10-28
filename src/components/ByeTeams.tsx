import { Moon } from "lucide-react";
import { byeTeams } from "#/lib/nfl/byes";
import { teamLogo } from "#/lib/nfl/teams";
import type { Game } from "#/lib/nfl/types";

/** "San Francisco 49ers" -> "49ers"; good enough for a chip. */
const nickname = (name: string) => name.split(" ").at(-1) ?? name;

/** Teams with the week off, shown under the last game. Hidden when nobody has a bye. */
export function ByeTeams({ games }: { games: Game[] }) {
	const teams = byeTeams(games);
	if (teams.length === 0) return null;
	return (
		<section
			aria-labelledby="bye-teams"
			className="mt-6 rounded-lg border bg-card/60 p-4"
		>
			<h3
				id="bye-teams"
				className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
			>
				<Moon className="size-3.5" aria-hidden />
				On bye{games[0]?.week ? ` in week ${games[0].week}` : ""}
			</h3>
			<ul className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
				{teams.map((team) => (
					<li
						key={team.abbr}
						title={team.name}
						className="flex items-center gap-2 rounded-md border bg-background/60 py-1.5 pr-3 pl-1.5 text-sm"
					>
						<img
							src={teamLogo(team.abbr)}
							alt=""
							loading="lazy"
							className="size-6 shrink-0 drop-shadow-sm"
						/>
						<span className="truncate font-medium">{nickname(team.name)}</span>
					</li>
				))}
			</ul>
		</section>
	);
}
