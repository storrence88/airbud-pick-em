import { LockKeyhole } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar, type AvatarProfile } from "./Avatar";

/** Another member's pick on a game, shown once the game locks. */
export interface Picker {
	id: string;
	profile: AvatarProfile;
	lock?: boolean;
}

/** Stand-in for someone whose profile isn't in the roster. */
export const unknownPlayer: AvatarProfile = {
	display_name: "Player",
	avatar_url: null,
	avatar_kind: "monogram",
	favorite_team: null,
};

const SIZE = 28;

/**
 * A row of the members who picked one side. Hovering an avatar (or tapping it
 * on a phone) shows whose it is.
 */
export function PickerAvatars({ pickers }: { pickers: Picker[] }) {
	const [open, setOpen] = useState<string | null>(null);
	return (
		<ul className="flex min-w-0 flex-wrap items-center gap-2.5 p-0.5">
			{pickers.map((p) => (
				<li key={p.id}>
					<PickerAvatar
						picker={p}
						open={open === p.id}
						onOpen={() => setOpen(p.id)}
						onClose={() => setOpen((o) => (o === p.id ? null : o))}
					/>
				</li>
			))}
		</ul>
	);
}

function PickerAvatar({
	picker,
	open,
	onOpen,
	onClose,
}: {
	picker: Picker;
	open: boolean;
	onOpen: () => void;
	onClose: () => void;
}) {
	const button = useRef<HTMLButtonElement>(null);
	const mouse = useRef(false);
	const name = picker.profile.display_name;
	const label = picker.lock ? `${name}, Lock of the Week` : name;

	// A tap opens the name until the next tap anywhere else, or a scroll.
	useEffect(() => {
		if (!open) return;
		const away = (e: PointerEvent) => {
			if (!button.current?.contains(e.target as Node)) onClose();
		};
		document.addEventListener("pointerdown", away);
		window.addEventListener("scroll", onClose, { passive: true });
		return () => {
			document.removeEventListener("pointerdown", away);
			window.removeEventListener("scroll", onClose);
		};
	}, [open, onClose]);

	return (
		<>
			<button
				ref={button}
				type="button"
				aria-label={label}
				className="relative block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onPointerEnter={(e) => e.pointerType === "mouse" && onOpen()}
				onPointerLeave={(e) => e.pointerType === "mouse" && onClose()}
				// Keyboard focus shows it too; a click's focus doesn't, or a tap would
				// open it on focus and close it again on click.
				onFocus={(e) => e.currentTarget.matches(":focus-visible") && onOpen()}
				onBlur={onClose}
				onPointerDown={(e) => {
					mouse.current = e.pointerType === "mouse";
				}}
				onClick={() => {
					if (!mouse.current) open ? onClose() : onOpen();
				}}
			>
				<Avatar profile={picker.profile} size={SIZE} />
				{picker.lock && (
					<span className="absolute -right-1.5 -bottom-1 grid size-3.5 place-items-center rounded-full bg-amber-400 text-black ring-2 ring-card">
						<LockKeyhole className="size-2" strokeWidth={3} aria-hidden />
					</span>
				)}
			</button>
			<NameTip anchor={button} open={open} label={name} lock={picker.lock} />
		</>
	);
}

/**
 * The name above an avatar. It lives in a portal so the card's rounded,
 * clipped edges can't cut it off, and it shifts inward near the screen edge.
 */
function NameTip({
	anchor,
	open,
	label,
	lock,
}: {
	anchor: React.RefObject<HTMLButtonElement | null>;
	open: boolean;
	label: string;
	lock?: boolean;
}) {
	const tip = useRef<HTMLDivElement>(null);
	const [spot, setSpot] = useState<{ x: number; y: number } | null>(null);

	useEffect(() => {
		if (!open) return;
		const r = anchor.current?.getBoundingClientRect();
		if (r) setSpot({ x: r.left + r.width / 2, y: r.top });
	}, [open, anchor]);

	// Once it has a width, nudge it back on screen.
	useEffect(() => {
		const el = tip.current;
		if (!open || !spot || !el) return;
		const half = el.offsetWidth / 2;
		const x = Math.min(
			Math.max(spot.x, half + 8),
			window.innerWidth - half - 8,
		);
		if (Math.abs(x - spot.x) > 0.5) setSpot({ ...spot, x });
	}, [open, spot]);

	if (typeof document === "undefined") return null;
	return createPortal(
		<AnimatePresence>
			{open && spot && (
				<motion.div
					ref={tip}
					role="tooltip"
					initial={{ opacity: 0, y: 4, scale: 0.96 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: 2, scale: 0.98 }}
					transition={{ duration: 0.12 }}
					className="pointer-events-none fixed z-50 flex max-w-48 -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background shadow-md"
					style={{ left: spot.x, top: spot.y - 6 }}
				>
					<span className="truncate">{label}</span>
					{lock && (
						<LockKeyhole
							className="size-3 shrink-0 text-amber-400"
							aria-label="Lock of the Week"
						/>
					)}
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
