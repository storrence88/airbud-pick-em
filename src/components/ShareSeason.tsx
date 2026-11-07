import { Share2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { seasonShare, seasonText } from "#/lib/season-share";
import {
	CARD_WIDTH,
	drawSeasonCard,
	loadCardFonts,
	seasonCardHeight,
} from "#/lib/share-card-draw";
import type { Member } from "#/server/leagues";
import { paint, ShareSheet, withPhoto } from "./ShareSheet";
import { useSeasonStandings } from "./Standings";

/**
 * "Share" on the Season standings: the table as text for Discord or as an
 * image. Standings only count final games, so there's nothing to hide.
 */
export function ShareSeason({ leagueId }: { leagueId: string }) {
	const { week, data, rows } = useSeasonStandings(leagueId);
	const [open, setOpen] = useState(false);
	const share = useMemo(
		() =>
			data
				? seasonShare({
						rows,
						names: new Map(
							week.members.map((m) => [m.user_id, m.display_name]),
						),
						weeks: data.weeks,
						league: week.league.name,
					})
				: null,
		[data, rows, week],
	);
	const views = useMemo(
		() =>
			share
				? [
						{
							id: "season",
							label: "Season",
							text: seasonText(share),
							fileName: `pickem-standings-week-${share.week}.png`,
							width: CARD_WIDTH,
							height: seasonCardHeight(share.rows.length),
							render: () => renderSeason(share, week.members),
						},
					]
				: [],
		[share, week.members],
	);
	if (!share) return null;
	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				aria-label="Share season standings"
				className="flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors hover:bg-muted sm:px-3"
			>
				<Share2 className="size-3.5" aria-hidden />
				Share
			</button>
			<AnimatePresence>
				{open && (
					<ShareSheet
						title="Share standings"
						views={views}
						initial="season"
						onClose={() => setOpen(false)}
					/>
				)}
			</AnimatePresence>
		</>
	);
}

async function renderSeason(
	share: NonNullable<ReturnType<typeof seasonShare>>,
	members: Member[],
) {
	const listed = members.filter((m) =>
		share.rows.some((r) => r.userId === m.user_id),
	);
	const [players] = await Promise.all([
		Promise.all(
			listed.map(async (m) => [m.user_id, await withPhoto(m)] as const),
		),
		loadCardFonts(),
	]);
	return paint(CARD_WIDTH, seasonCardHeight(share.rows.length), (ctx) =>
		drawSeasonCard(ctx, share, new Map(players)),
	);
}
