import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, Link2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "#/lib/utils";
import { resetInviteCode } from "#/server/leagues";

/** Commissioner-only panel for swapping the invite code when the old link got around. */
export function ResetInvite({
	leagueId,
	code,
}: {
	leagueId: string;
	code: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<section className="mt-4 rounded-lg border bg-card">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-3 text-left"
			>
				<Link2 className="size-5 text-muted-foreground" aria-hidden />
				<span className="flex-1">
					<span className="block font-semibold">Reset invite link</span>
					<span className="block text-sm text-muted-foreground">
						Make a new code if the old one got shared too widely.
					</span>
				</span>
				<ChevronDown
					className={cn(
						"size-5 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
					aria-hidden
				/>
			</button>
			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="overflow-hidden"
					>
						<Reset leagueId={leagueId} code={code} />
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

function Reset({ leagueId, code }: { leagueId: string; code: string }) {
	const qc = useQueryClient();
	const [confirming, setConfirming] = useState(false);
	const [fresh, setFresh] = useState(false);

	const reset = useMutation({
		mutationFn: () => resetInviteCode({ data: { leagueId } }),
		onSuccess: async () => {
			// The settings page and the league page's invite button both show the code.
			await qc.invalidateQueries({ queryKey: ["league", leagueId] });
			setConfirming(false);
			setFresh(true);
		},
	});

	return (
		<div className="border-t px-4 py-4 text-sm">
			<p className="text-muted-foreground">
				The old link stops working right away. Everyone already in the league
				stays, and removed players can't use the old link to rejoin.
			</p>
			<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{fresh ? "New code" : "Current code"}
					</div>
					<AnimatePresence mode="popLayout" initial={false}>
						<motion.div
							key={code}
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -6 }}
							transition={{ duration: 0.2 }}
							className="font-mono text-lg font-semibold tracking-wider"
						>
							{code}
						</motion.div>
					</AnimatePresence>
				</div>
				<CopyLink code={code} />
			</div>
			<AnimatePresence mode="wait" initial={false}>
				{confirming ? (
					<motion.div
						key="confirm"
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="mt-4 rounded-md border border-primary/50 bg-primary/5 p-3"
					>
						<div className="font-semibold">Reset the invite link?</div>
						<p className="mt-1 text-muted-foreground">
							Anyone holding the old link will need the new one to join.
						</p>
						<div className="mt-3 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setConfirming(false)}
								disabled={reset.isPending}
								className="h-10 rounded-full px-4 font-semibold text-muted-foreground hover:bg-muted"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => reset.mutate()}
								disabled={reset.isPending}
								className="h-10 rounded-full bg-primary px-4 font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
							>
								{reset.isPending ? "Resetting…" : "Reset link"}
							</button>
						</div>
					</motion.div>
				) : (
					<motion.div
						key="start"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="mt-4 flex justify-end"
					>
						<button
							type="button"
							onClick={() => {
								reset.reset();
								setConfirming(true);
							}}
							className="h-10 rounded-full border px-4 font-semibold transition-transform hover:bg-muted active:scale-95"
						>
							Reset invite link
						</button>
					</motion.div>
				)}
			</AnimatePresence>
			{reset.error && (
				<p className="mt-2 text-loss">{(reset.error as Error).message}</p>
			)}
		</div>
	);
}

function CopyLink({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={async () => {
				await navigator.clipboard.writeText(
					`${window.location.origin}/join/${code}`,
				);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
			className="flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 font-semibold transition-colors hover:bg-muted"
		>
			{copied ? (
				<Check className="size-4 text-primary" aria-hidden />
			) : (
				<Copy className="size-4" aria-hidden />
			)}
			{copied ? "Link copied" : "Copy link"}
		</button>
	);
}
