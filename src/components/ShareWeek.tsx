import { Share2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import type { PublicProfile } from "#/lib/profile";
import {
	type GroupShare,
	groupText,
	personalText,
	type ShareCard,
} from "#/lib/share-card";
import {
	CARD_HEIGHT,
	CARD_WIDTH,
	drawGroupCard,
	drawShareCard,
	groupCardHeight,
	loadCardFonts,
} from "#/lib/share-card-draw";
import { NewDot, useNewDot } from "./NewDot";
import { paint, ShareSheet, type ShareView, withPhoto } from "./ShareSheet";

type Member = PublicProfile & { user_id: string };
type Tab = "me" | "league";

const VIEW_KEY = "pickem:share-view";

async function renderMine(card: ShareCard, player: PublicProfile) {
	const [p] = await Promise.all([withPhoto(player), loadCardFonts()]);
	return paint(CARD_WIDTH, CARD_HEIGHT, (ctx) => drawShareCard(ctx, card, p));
}

async function renderGroup(group: GroupShare, members: Member[]) {
	const listed = members.filter((m) =>
		group.rows.some((r) => r.userId === m.user_id),
	);
	const [players] = await Promise.all([
		Promise.all(
			listed.map(async (m) => [m.user_id, await withPhoto(m)] as const),
		),
		loadCardFonts(),
	]);
	return paint(CARD_WIDTH, groupCardHeight(group.rows.length), (ctx) =>
		drawGroupCard(ctx, group, new Map(players)),
	);
}

/**
 * "Share": your week or the whole league's, as text to paste into Discord or
 * as an image. Shows from the first kickoff, so people can post on Sunday
 * night; picks for games that haven't kicked off never make it in.
 */
export function ShareWeek({
	week,
	card,
	group,
	me,
	members,
}: {
	week: number;
	card: ShareCard | null;
	group: GroupShare;
	me: PublicProfile | null;
	members: Member[];
}) {
	const [open, setOpen] = useState(false);
	const dot = useNewDot("share");
	return (
		<>
			<button
				type="button"
				onClick={() => {
					dot.dismiss();
					setOpen(true);
				}}
				aria-label={`Share week ${week}`}
				className="relative flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold transition-colors hover:bg-muted sm:px-3.5"
			>
				<Share2 className="size-4" aria-hidden />
				<span className="hidden sm:inline">Share</span>
				<NewDot show={dot.show} />
			</button>
			<AnimatePresence>
				{open && (
					<WeekSheet
						week={week}
						card={me ? card : null}
						group={group}
						me={me}
						members={members}
						onClose={() => setOpen(false)}
					/>
				)}
			</AnimatePresence>
		</>
	);
}

function savedTab(): Tab | null {
	try {
		const v = localStorage.getItem(VIEW_KEY);
		return v === "me" || v === "league" ? v : null;
	} catch {
		return null;
	}
}

function WeekSheet({
	week,
	card,
	group,
	me,
	members,
	onClose,
}: {
	week: number;
	card: ShareCard | null;
	group: GroupShare;
	me: PublicProfile | null;
	members: Member[];
	onClose: () => void;
}) {
	const views = useMemo<ShareView[]>(
		() => [
			{
				id: "me",
				label: "Me",
				text: card && me ? personalText(card, me.display_name) : "",
				fileName: `pickem-week-${week}.png`,
				width: CARD_WIDTH,
				height: CARD_HEIGHT,
				render: () =>
					card && me
						? renderMine(card, me)
						: Promise.reject(new Error("Nothing of yours to share yet.")),
				disabled: card ? null : "None of your picks have kicked off yet",
			},
			{
				id: "league",
				label: "League",
				text: groupText(group),
				fileName: `pickem-week-${week}-league.png`,
				width: CARD_WIDTH,
				height: groupCardHeight(group.rows.length),
				render: () => renderGroup(group, members),
			},
		],
		[week, card, me, group, members],
	);
	return (
		<ShareSheet
			title={`Share week ${week}`}
			views={views}
			// Remember Me vs League per device; without a pick showing yet, only League works.
			initial={card ? (savedTab() ?? "me") : "league"}
			onChoose={(t) => {
				try {
					localStorage.setItem(VIEW_KEY, t);
				} catch {}
			}}
			onClose={onClose}
		/>
	);
}
