import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, SendHorizontal, SmilePlus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	groupReactions,
	MAX_COMMENT,
	mentionQuery,
	parseMentions,
	REACTIONS,
	timeAgo,
} from "#/lib/comments";
import { cn } from "#/lib/utils";
import {
	type CommentRow,
	deleteComment,
	markMentionsSeen,
	myMentionsQuery,
	postComment,
	setReaction,
	weekCommentsQuery,
} from "#/server/comments";
import type { Member } from "#/server/leagues";
import { Avatar } from "./Avatar";
import { unknownPlayer } from "./PickerAvatars";

interface CommentsContextValue {
	leagueId: string;
	userId: string;
	members: Member[];
	canModerate: boolean;
	byGame: Map<string, CommentRow[]>;
	/** Comments on each game that @mention you and you haven't seen yet. */
	unseen: Map<string, string[]>;
	/** A game whose comments should open right away (from a notification). */
	openGameId?: string;
	onOpened: () => void;
	queryKey: readonly unknown[];
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

/** Comments for a league's week of games; game cards inside pick them up. */
export function CommentsProvider({
	leagueId,
	userId,
	members,
	gameIds,
	openGameId,
	onOpened,
	children,
}: {
	leagueId: string;
	userId: string;
	members: Member[];
	gameIds: string[];
	openGameId?: string;
	onOpened: () => void;
	children: ReactNode;
}) {
	const query = weekCommentsQuery(leagueId, gameIds);
	const { data: comments = [] } = useQuery(query);
	const { data: mentions = [] } = useQuery(myMentionsQuery());
	const value = useMemo(() => {
		const byGame = new Map<string, CommentRow[]>();
		for (const c of comments)
			byGame.set(c.game_id, [...(byGame.get(c.game_id) ?? []), c]);
		const unseen = new Map<string, string[]>();
		for (const m of mentions)
			if (!m.seen && m.league_id === leagueId)
				unseen.set(m.game_id, [...(unseen.get(m.game_id) ?? []), m.comment_id]);
		return {
			leagueId,
			userId,
			members,
			canModerate: members.some(
				(m) => m.user_id === userId && m.role === "commissioner",
			),
			byGame,
			unseen,
			openGameId,
			onOpened,
			queryKey: query.queryKey,
		};
	}, [
		comments,
		mentions,
		leagueId,
		userId,
		members,
		openGameId,
		onOpened,
		query.queryKey,
	]);
	return (
		<CommentsContext.Provider value={value}>
			{children}
		</CommentsContext.Provider>
	);
}

export const useComments = () => useContext(CommentsContext);

/** The speech bubble on a game card: how many comments, and a dot if you're mentioned. */
export function CommentsButton({
	gameId,
	label,
	onOpen,
}: {
	gameId: string;
	label: string;
	onOpen: () => void;
}) {
	const ctx = useComments();
	if (!ctx) return null;
	const count = ctx.byGame.get(gameId)?.length ?? 0;
	const mentioned = (ctx.unseen.get(gameId)?.length ?? 0) > 0;
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={`${label} comments${count ? `, ${count}` : ""}${mentioned ? ", you were mentioned" : ""}`}
			title="Comments"
			className={cn(
				"relative -my-1 flex h-7 items-center gap-1 rounded-full px-1.5 transition-colors hover:bg-muted hover:text-foreground",
				mentioned && "text-primary",
			)}
		>
			<MessageCircle className="size-4" aria-hidden />
			{count > 0 && (
				<motion.span
					key={count}
					initial={{ scale: 1.6 }}
					animate={{ scale: 1 }}
					className="text-[11px] font-semibold tabular-nums"
				>
					{count}
				</motion.span>
			)}
			{mentioned && (
				<span className="absolute top-0 right-0 size-2 rounded-full bg-primary ring-2 ring-card" />
			)}
		</button>
	);
}

/** The comments tab of the game details sheet; CommentComposer sits under it. */
export function CommentList({ gameId }: { gameId: string }) {
	const ctx = useComments();
	const qc = useQueryClient();
	const list = ctx?.byGame.get(gameId) ?? [];
	const unseen = ctx?.unseen.get(gameId);
	const bottom = useRef<HTMLDivElement>(null);
	const firstScroll = useRef(true);

	// Opening the comments counts as reading your mentions here.
	const unseenKey = unseen?.join(",") ?? "";
	useEffect(() => {
		if (!unseenKey) return;
		markMentionsSeen({ data: { commentIds: unseenKey.split(",") } })
			.catch(() => {})
			.then(() =>
				qc.invalidateQueries({ queryKey: myMentionsQuery().queryKey }),
			);
	}, [unseenKey, qc]);

	// Newest is at the bottom, next to the box; keep it in view.
	useEffect(() => {
		if (!list.length) return;
		bottom.current?.scrollIntoView({
			block: "end",
			behavior: firstScroll.current ? "auto" : "smooth",
		});
		firstScroll.current = false;
	}, [list.length]);

	if (!ctx) return null;
	return (
		<div className="flex min-h-full flex-col">
			{list.length === 0 ? (
				<div className="grid flex-1 place-items-center py-10 text-center">
					<div>
						<MessageCircle
							className="mx-auto size-8 text-muted-foreground/50"
							aria-hidden
						/>
						<p className="mt-2 text-sm font-medium">No comments yet</p>
						<p className="text-xs text-muted-foreground">
							Start the trash talk. Type @ to call someone out.
						</p>
					</div>
				</div>
			) : (
				<ul className="flex-1 space-y-4 pb-4">
					<AnimatePresence initial={false}>
						{list.map((c) => (
							<CommentItem key={c.id} comment={c} />
						))}
					</AnimatePresence>
				</ul>
			)}
			<div ref={bottom} />
		</div>
	);
}

function CommentItem({ comment }: { comment: CommentRow }) {
	const ctx = useComments();
	const qc = useQueryClient();
	const [picker, setPicker] = useState(false);
	const [confirm, setConfirm] = useState(false);
	if (!ctx) return null;
	const author = ctx.members.find((m) => m.user_id === comment.author_id);
	const mine = comment.author_id === ctx.userId;
	const groups = groupReactions(comment.reactions, ctx.userId);
	const nameOf = (id: string) =>
		id === ctx.userId
			? "You"
			: (ctx.members.find((m) => m.user_id === id)?.display_name ?? "Player");

	const update = (fn: (rows: CommentRow[]) => CommentRow[]) =>
		qc.setQueryData<CommentRow[]>(ctx.queryKey, (old) => (old ? fn(old) : old));
	const react = (emoji: string, on: boolean) => {
		setPicker(false);
		update((rows) =>
			rows.map((r) =>
				r.id !== comment.id
					? r
					: {
							...r,
							reactions: on
								? [...r.reactions, { user_id: ctx.userId, emoji }]
								: r.reactions.filter(
										(x) => !(x.user_id === ctx.userId && x.emoji === emoji),
									),
						},
			),
		);
		setReaction({ data: { commentId: comment.id, emoji, on } }).catch(() =>
			qc.invalidateQueries({ queryKey: ctx.queryKey }),
		);
	};
	const remove = () => {
		update((rows) => rows.filter((r) => r.id !== comment.id));
		deleteComment({ data: { commentId: comment.id } }).finally(() =>
			qc.invalidateQueries({ queryKey: ctx.queryKey }),
		);
	};

	return (
		<motion.li
			layout
			initial={{ opacity: 0, y: 12, scale: 0.97 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }}
			transition={{ type: "spring", stiffness: 380, damping: 30 }}
			className="group flex gap-3"
		>
			<Avatar profile={author ?? unknownPlayer} size={32} className="mt-0.5" />
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-2">
					<span className="truncate text-sm font-semibold">
						{author?.display_name ?? "Former member"}
					</span>
					<time
						dateTime={comment.created_at}
						title={new Date(comment.created_at).toLocaleString()}
						className="shrink-0 text-[11px] text-muted-foreground"
					>
						{timeAgo(comment.created_at)}
					</time>
					{(mine || ctx.canModerate) &&
						(confirm ? (
							<span className="ml-auto flex shrink-0 gap-2 text-[11px] font-semibold">
								<button
									type="button"
									onClick={remove}
									className="text-loss hover:underline"
								>
									Delete
								</button>
								<button
									type="button"
									onClick={() => setConfirm(false)}
									className="text-muted-foreground hover:underline"
								>
									Keep
								</button>
							</span>
						) : (
							<button
								type="button"
								onClick={() => setConfirm(true)}
								aria-label="Delete comment"
								className="ml-auto grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
							>
								<Trash2 className="size-3.5" />
							</button>
						))}
				</div>
				<p className="text-sm break-words whitespace-pre-wrap">
					{parseMentions(comment.body, ctx.members).map((p, i) =>
						p.kind === "mention" ? (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
								key={i}
								className={cn(
									"rounded px-0.5 font-semibold text-primary",
									p.userId === ctx.userId && "bg-primary/15",
								)}
							>
								{p.text}
							</span>
						) : (
							// biome-ignore lint/suspicious/noArrayIndexKey: parts never reorder
							<span key={i}>{p.text}</span>
						),
					)}
				</p>
				<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
					<AnimatePresence initial={false}>
						{groups.map((g) => (
							<motion.button
								key={g.emoji}
								type="button"
								layout
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								exit={{ scale: 0 }}
								whileTap={{ scale: 0.85 }}
								onClick={() => react(g.emoji, !g.mine)}
								title={g.userIds.map(nameOf).join(", ")}
								aria-pressed={g.mine}
								className={cn(
									"flex h-7 items-center gap-1 rounded-full border px-2 text-sm transition-colors",
									g.mine ? "border-primary/50 bg-primary/10" : "hover:bg-muted",
								)}
							>
								<span aria-hidden>{g.emoji}</span>
								<span className="text-xs font-semibold tabular-nums">
									{g.count}
								</span>
								<span className="sr-only">
									{g.mine ? ", you reacted" : ", react"}
								</span>
							</motion.button>
						))}
					</AnimatePresence>
					<div className="relative">
						<button
							type="button"
							onClick={() => setPicker(!picker)}
							aria-label="Add a reaction"
							aria-expanded={picker}
							className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<SmilePlus className="size-4" />
						</button>
						<AnimatePresence>
							{picker && (
								<motion.div
									initial={{ opacity: 0, y: 6, scale: 0.9 }}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									exit={{ opacity: 0, y: 6, scale: 0.9 }}
									transition={{ type: "spring", stiffness: 500, damping: 30 }}
									className="absolute bottom-full left-0 z-10 mb-1.5 flex gap-0.5 rounded-full border bg-card p-1 shadow-lg"
								>
									{REACTIONS.map((e, i) => {
										const on = groups.some((g) => g.emoji === e && g.mine);
										return (
											<motion.button
												key={e}
												type="button"
												initial={{ opacity: 0, y: 8 }}
												animate={{ opacity: 1, y: 0 }}
												transition={{ delay: i * 0.025 }}
												whileHover={{ scale: 1.3, y: -2 }}
												whileTap={{ scale: 0.8 }}
												onClick={() => react(e, !on)}
												aria-label={`React ${e}`}
												className={cn(
													"grid size-8 place-items-center rounded-full text-lg",
													on && "bg-primary/15",
												)}
											>
												{e}
											</motion.button>
										);
									})}
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</motion.li>
	);
}

/** The comment box, pinned under the comment list. */
export function CommentComposer({ gameId }: { gameId: string }) {
	const ctx = useComments();
	const qc = useQueryClient();
	const [text, setText] = useState("");
	const [cursor, setCursor] = useState(0);
	const [active, setActive] = useState(0);
	const [error, setError] = useState("");
	const box = useRef<HTMLTextAreaElement>(null);

	const send = useMutation({
		mutationFn: (body: string) =>
			postComment({
				data: { leagueId: ctx?.leagueId ?? "", gameId, body },
			}),
		onSuccess: () => {
			setText("");
			setError("");
			if (ctx) qc.invalidateQueries({ queryKey: ctx.queryKey });
		},
		onError: (e) => setError((e as Error).message),
	});

	const q = mentionQuery(text, cursor);
	const matches = useMemo(() => {
		if (!q || !ctx) return [];
		const needle = q.query.toLowerCase();
		return ctx.members.filter(
			(m) =>
				m.user_id !== ctx.userId &&
				m.display_name.toLowerCase().startsWith(needle),
		);
	}, [q, ctx]);

	if (!ctx) return null;

	const pickMention = (name: string) => {
		if (!q) return;
		const next = `${text.slice(0, q.start)}@${name} ${text.slice(cursor)}`;
		const at = q.start + name.length + 2;
		setText(next);
		setCursor(at);
		setActive(0);
		requestAnimationFrame(() => {
			box.current?.focus();
			box.current?.setSelectionRange(at, at);
		});
	};
	const submit = () => {
		const body = text.trim();
		if (body && !send.isPending) send.mutate(body);
	};

	return (
		<div className="shrink-0 border-t bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
			<AnimatePresence>
				{matches.length > 0 && (
					<motion.ul
						initial={{ opacity: 0, y: 6 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 6 }}
						role="listbox"
						aria-label="Mention someone"
						className="mb-2 overflow-hidden rounded-lg border bg-card shadow-lg"
					>
						{matches.map((m, i) => (
							<li key={m.user_id}>
								<button
									type="button"
									role="option"
									aria-selected={i === active}
									onPointerDown={(e) => e.preventDefault()}
									onClick={() => pickMention(m.display_name)}
									className={cn(
										"flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
										i === active ? "bg-muted" : "hover:bg-muted/60",
									)}
								>
									<Avatar profile={m} size={24} />
									{m.display_name}
								</button>
							</li>
						))}
					</motion.ul>
				)}
			</AnimatePresence>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					submit();
				}}
				className="flex items-end gap-2"
			>
				<textarea
					ref={box}
					value={text}
					rows={1}
					maxLength={MAX_COMMENT}
					placeholder="Say something… @ to mention"
					aria-label="Write a comment"
					onChange={(e) => {
						setText(e.target.value);
						setCursor(e.target.selectionStart);
						setActive(0);
					}}
					onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
					onKeyDown={(e) => {
						if (matches.length) {
							if (e.key === "ArrowDown" || e.key === "ArrowUp") {
								e.preventDefault();
								const d = e.key === "ArrowDown" ? 1 : -1;
								setActive((active + d + matches.length) % matches.length);
								return;
							}
							if (e.key === "Enter" || e.key === "Tab") {
								e.preventDefault();
								pickMention(matches[active].display_name);
								return;
							}
						}
						if (
							e.key === "Enter" &&
							!e.shiftKey &&
							!e.nativeEvent.isComposing
						) {
							e.preventDefault();
							submit();
						}
					}}
					className="field-sizing-content max-h-32 min-h-10 flex-1 resize-none rounded-2xl border bg-background px-3.5 py-2 text-base outline-none transition-colors focus:border-primary sm:text-sm"
				/>
				<motion.button
					type="submit"
					whileTap={{ scale: 0.88 }}
					disabled={!text.trim() || send.isPending}
					aria-label="Send comment"
					className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
				>
					<SendHorizontal className="size-4" />
				</motion.button>
			</form>
			{error && <p className="mt-1 text-xs text-loss">{error}</p>}
		</div>
	);
}
