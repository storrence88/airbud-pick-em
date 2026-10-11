import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, UserMinus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "#/lib/utils";
import { type Member, removeMember } from "#/server/leagues";
import { MemberChoice } from "./MemberChoice";

const PICK_OPTIONS = [
	{
		keep: true,
		label: "Keep picks",
		detail:
			"Their finished games stay in the standings under Former members. If they rejoin, their season comes back.",
	},
	{
		keep: false,
		label: "Wipe picks",
		detail:
			"Every pick, Lock of the Week and trash talk line they made in this league is deleted.",
	},
] as const;

/** Commissioner-only panel for kicking a member, keeping or wiping their picks. */
export function RemoveMember({
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
				<UserMinus className="size-5 text-muted-foreground" aria-hidden />
				<span className="flex-1">
					<span className="block font-semibold">Remove a member</span>
					<span className="block text-sm text-muted-foreground">
						Take someone out of the league.
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
	const [picked, setPicked] = useState<string | null>(null);
	const [keepPicks, setKeepPicks] = useState(true);
	const [confirming, setConfirming] = useState(false);
	const [removed, setRemoved] = useState<string | null>(null);
	const target = others.find((m) => m.user_id === picked);

	const remove = useMutation({
		mutationFn: (m: Member) =>
			removeMember({ data: { leagueId, userId: m.user_id, keepPicks } }),
		onSuccess: async (_, m) => {
			// The roster, week picks and standings all change.
			await qc.invalidateQueries({ queryKey: ["league", leagueId] });
			setPicked(null);
			setConfirming(false);
			setRemoved(m.display_name);
		},
	});

	const reset = () => {
		setConfirming(false);
		setRemoved(null);
		remove.reset();
	};

	if (!others.length)
		return (
			<div className="border-t px-4 py-4 text-sm">
				{removed && <Removed name={removed} />}
				<p className="text-muted-foreground">
					There's no one else in the league.
				</p>
			</div>
		);

	return (
		<div className="border-t px-4 py-4 text-sm">
			<AnimatePresence initial={false}>
				{removed && <Removed name={removed} />}
			</AnimatePresence>
			<p className="text-muted-foreground">
				They can rejoin with the invite link, so you may want to share a new one
				with everyone else.
			</p>
			<MemberChoice
				name="remove-member"
				legend="Member to remove"
				members={others}
				value={picked}
				onChange={(id) => {
					setPicked(id);
					reset();
				}}
			/>
			<fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
				<legend className="mb-2 font-semibold">Their picks</legend>
				{PICK_OPTIONS.map((o) => {
					const selected = keepPicks === o.keep;
					return (
						<label
							key={o.label}
							className={cn(
								"flex cursor-pointer gap-3 rounded-md border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/40",
								selected
									? o.keep
										? "border-primary bg-primary/5"
										: "border-loss/60 bg-loss/5"
									: "hover:bg-muted",
							)}
						>
							<input
								type="radio"
								name="remove-picks"
								checked={selected}
								onChange={() => {
									setKeepPicks(o.keep);
									reset();
								}}
								className="sr-only"
							/>
							<span
								className={cn(
									"mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
									selected &&
										(o.keep
											? "border-primary bg-primary text-primary-foreground"
											: "border-loss bg-loss text-white"),
								)}
								aria-hidden
							>
								{selected && <Check className="size-3.5" />}
							</span>
							<span className="min-w-0">
								<span className="block font-medium">{o.label}</span>
								<span className="block text-xs text-muted-foreground">
									{o.detail}
								</span>
							</span>
						</label>
					);
				})}
			</fieldset>
			<AnimatePresence mode="wait" initial={false}>
				{confirming && target ? (
					<motion.div
						key="confirm"
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="mt-4 rounded-md border border-loss/40 bg-loss/5 p-3"
					>
						<div className="font-semibold">
							Remove {target.display_name} from the league?
						</div>
						<p className="mt-1 text-muted-foreground">
							{keepPicks
								? "Their picks on games that haven't started yet are cleared."
								: "Their picks can't be brought back."}
						</p>
						<div className="mt-3 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setConfirming(false)}
								disabled={remove.isPending}
								className="h-10 rounded-full px-4 font-semibold text-muted-foreground hover:bg-muted"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={() => remove.mutate(target)}
								disabled={remove.isPending}
								className="h-10 rounded-full bg-loss px-4 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
							>
								{remove.isPending ? "Removing…" : "Remove"}
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
							Remove member
						</button>
					</motion.div>
				)}
			</AnimatePresence>
			{remove.error && (
				<p className="mt-2 text-loss">{(remove.error as Error).message}</p>
			)}
		</div>
	);
}

function Removed({ name }: { name: string }) {
	return (
		<motion.p
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			className="mb-3 flex items-center gap-1.5 font-semibold text-primary"
		>
			<Check className="size-4" aria-hidden /> Removed {name}.
		</motion.p>
	);
}
