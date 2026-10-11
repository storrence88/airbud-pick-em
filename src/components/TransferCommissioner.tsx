import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Crown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "#/lib/utils";
import { type Member, transferCommissioner } from "#/server/leagues";
import { MemberChoice } from "./MemberChoice";

/** Commissioner-only panel for handing the role to another member. */
export function TransferCommissioner({
	leagueId,
	members,
	userId,
}: {
	leagueId: string;
	members: Member[];
	userId: string;
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
				<Crown className="size-5 text-muted-foreground" aria-hidden />
				<span className="flex-1">
					<span className="block font-semibold">Transfer commissioner</span>
					<span className="block text-sm text-muted-foreground">
						Hand the league to another member.
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
						<Picker
							leagueId={leagueId}
							others={members.filter((m) => m.user_id !== userId)}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

function Picker({ leagueId, others }: { leagueId: string; others: Member[] }) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [picked, setPicked] = useState<string | null>(null);
	const [confirming, setConfirming] = useState(false);
	const target = others.find((m) => m.user_id === picked);

	const transfer = useMutation({
		mutationFn: (userId: string) =>
			transferCommissioner({ data: { leagueId, userId } }),
		onSuccess: async () => {
			// The roster, the settings page and the leagues list all show roles.
			await qc.invalidateQueries({ queryKey: ["league", leagueId] });
			qc.invalidateQueries({ queryKey: ["leagues"] });
			navigate({ to: "/league/$leagueId", params: { leagueId } });
		},
	});

	if (!others.length)
		return (
			<p className="border-t px-4 py-4 text-sm text-muted-foreground">
				Invite someone to the league first.
			</p>
		);

	return (
		<div className="border-t px-4 py-4 text-sm">
			<p className="text-muted-foreground">
				They get these settings and the bot keys. You stay in the league as a
				regular member.
			</p>
			<MemberChoice
				name="new-commissioner"
				legend="New commissioner"
				members={others}
				value={picked}
				onChange={(id) => {
					setPicked(id);
					setConfirming(false);
					transfer.reset();
				}}
			/>
			<AnimatePresence mode="wait" initial={false}>
				{confirming && target ? (
					<motion.div
						key="confirm"
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="mt-4 rounded-md border border-primary/50 bg-primary/5 p-3"
					>
						<div className="font-semibold">
							Make {target.display_name} the commissioner?
						</div>
						<p className="mt-1 text-muted-foreground">
							You'll lose access to this page. Only they can hand it back.
						</p>
						<div className="mt-3 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setConfirming(false)}
								disabled={transfer.isPending}
								className="h-10 rounded-full px-4 font-semibold text-muted-foreground hover:bg-muted"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => transfer.mutate(target.user_id)}
								disabled={transfer.isPending}
								className="h-10 rounded-full bg-primary px-4 font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
							>
								{transfer.isPending ? "Transferring…" : "Transfer"}
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
							onClick={() => setConfirming(true)}
							disabled={!target}
							className="h-10 rounded-full border px-4 font-semibold transition-[transform,opacity] hover:bg-muted active:scale-95 disabled:opacity-50"
						>
							Make commissioner
						</button>
					</motion.div>
				)}
			</AnimatePresence>
			{transfer.error && (
				<p className="mt-2 text-loss">{(transfer.error as Error).message}</p>
			)}
		</div>
	);
}
