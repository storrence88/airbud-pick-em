import { Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, X } from "lucide-react";
import {
	AnimatePresence,
	motion,
	type PanInfo,
	useDragControls,
} from "motion/react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { ProfileHeader, SeasonTiles, useProfile } from "./PlayerProfile";

interface SheetApi {
	leagueId: string;
	open: (userId: string) => void;
}

const SheetContext = createContext<SheetApi | null>(null);

/**
 * Lets anything on the league page open a player's quick profile. On phones a
 * tap on a name or avatar opens it as a bottom sheet; a mouse click goes
 * straight to the full profile page.
 */
export function PlayerSheetProvider({
	leagueId,
	children,
}: {
	leagueId: string;
	children: ReactNode;
}) {
	const [userId, setUserId] = useState<string | null>(null);
	const api = useMemo(
		() => ({ leagueId, open: (id: string) => setUserId(id) }),
		[leagueId],
	);
	const close = useCallback(() => setUserId(null), []);
	return (
		<SheetContext.Provider value={api}>
			{children}
			<PlayerSheet leagueId={leagueId} userId={userId} onClose={close} />
		</SheetContext.Provider>
	);
}

export const usePlayerSheet = () => useContext(SheetContext);

/**
 * A link to a player's profile. A touch opens the quick sheet instead when
 * the page has one; mouse, keyboard and modified clicks follow the link.
 */
export function PlayerLink({
	userId,
	leagueId,
	className,
	title,
	label,
	children,
	onPointerEnter,
	onPointerLeave,
	onFocus,
	onBlur,
	linkRef,
}: {
	userId: string;
	leagueId?: string;
	className?: string;
	title?: string;
	label?: string;
	children: ReactNode;
	onPointerEnter?: React.PointerEventHandler<HTMLAnchorElement>;
	onPointerLeave?: React.PointerEventHandler<HTMLAnchorElement>;
	onFocus?: React.FocusEventHandler<HTMLAnchorElement>;
	onBlur?: React.FocusEventHandler<HTMLAnchorElement>;
	linkRef?: React.Ref<HTMLAnchorElement>;
}) {
	const sheet = usePlayerSheet();
	const touch = useRef(false);
	const league = leagueId ?? sheet?.leagueId;
	if (!league) return <span className={className}>{children}</span>;
	return (
		<Link
			ref={linkRef}
			to="/league/$leagueId/player/$userId"
			params={{ leagueId: league, userId }}
			title={title}
			aria-label={label}
			className={className}
			onPointerDown={(e) => {
				touch.current = e.pointerType !== "mouse";
			}}
			onPointerEnter={onPointerEnter}
			onPointerLeave={onPointerLeave}
			onFocus={onFocus}
			onBlur={onBlur}
			onClick={(e) => {
				if (!touch.current || !sheet) return;
				touch.current = false;
				e.preventDefault();
				sheet.open(userId);
			}}
		>
			{children}
		</Link>
	);
}

function PlayerSheet({
	leagueId,
	userId,
	onClose,
}: {
	leagueId: string;
	userId: string | null;
	onClose: () => void;
}) {
	const drag = useDragControls();
	const titleId = useId();
	const closeRef = useRef<HTMLButtonElement>(null);
	const open = userId != null;

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		document.addEventListener("keydown", onKey);
		const overflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		closeRef.current?.focus();
		return () => {
			document.removeEventListener("keydown", onKey);
			document.body.style.overflow = overflow;
		};
	}, [open, onClose]);

	if (typeof document === "undefined") return null;
	return createPortal(
		<AnimatePresence>
			{userId && (
				<div className="fixed inset-0 z-50">
					<motion.div
						className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
					/>
					<motion.div
						role="dialog"
						aria-modal="true"
						aria-labelledby={titleId}
						initial={{ y: "100%" }}
						animate={{ y: 0 }}
						exit={{ y: "100%" }}
						transition={{ type: "spring", stiffness: 380, damping: 38 }}
						drag="y"
						dragControls={drag}
						dragListener={false}
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0, bottom: 0.6 }}
						onDragEnd={(_: unknown, info: PanInfo) => {
							if (info.offset.y > 100 || info.velocity.y > 500) onClose();
						}}
						className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
					>
						<div
							className="flex touch-none justify-center pt-2.5 pb-6"
							onPointerDown={(e) => drag.start(e)}
						>
							<span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
						</div>
						<button
							ref={closeRef}
							type="button"
							onClick={onClose}
							aria-label="Close"
							className="absolute top-1.5 right-2 z-10 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<X className="size-4" aria-hidden />
						</button>
						<SheetBody
							key={userId}
							leagueId={leagueId}
							userId={userId}
							titleId={titleId}
						/>
					</motion.div>
				</div>
			)}
		</AnimatePresence>,
		document.body,
	);
}

function SheetBody({
	leagueId,
	userId,
	titleId,
}: {
	leagueId: string;
	userId: string;
	titleId: string;
}) {
	const profile = useProfile(leagueId, userId);
	if (!profile.member)
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">
				That player isn't in this league anymore.
			</p>
		);
	return (
		<div className="grid gap-3">
			<ProfileHeader profile={profile} titleId={titleId} compact />
			<SeasonTiles profile={profile} />
			<div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
				<Link
					to="/league/$leagueId/player/$userId"
					params={{ leagueId, userId }}
					className="flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
				>
					Full profile
					<ArrowRight className="size-4" aria-hidden />
				</Link>
				<Link
					to="/league/$leagueId/stats/$userId"
					params={{ leagueId, userId }}
					aria-label="Season stats"
					title="Season stats"
					className="grid size-11 place-items-center rounded-full border transition-colors hover:bg-muted"
				>
					<BarChart3 className="size-4" aria-hidden />
				</Link>
			</div>
		</div>
	);
}
