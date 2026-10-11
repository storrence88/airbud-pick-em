import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "#/lib/utils";
import { deleteLeague } from "#/server/leagues";

/** Commissioner-only panel for deleting the league, confirmed by typing its name. */
export function DeleteLeague({
	leagueId,
	leagueName,
}: {
	leagueId: string;
	leagueName: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<section className="mt-4 rounded-lg border border-loss/30 bg-card">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-3 text-left"
			>
				<Trash2 className="size-5 text-loss" aria-hidden />
				<span className="flex-1">
					<span className="block font-semibold">Delete league</span>
					<span className="block text-sm text-muted-foreground">
						Permanently remove the league for everyone.
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
						<Confirm leagueId={leagueId} leagueName={leagueName} />
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

function Confirm({
	leagueId,
	leagueName,
}: {
	leagueId: string;
	leagueName: string;
}) {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [typed, setTyped] = useState("");
	const matches = typed.trim() === leagueName.trim();

	const remove = useMutation({
		mutationFn: () => deleteLeague({ data: { leagueId, confirmName: typed } }),
		onSuccess: async () => {
			await navigate({ to: "/leagues" });
			qc.removeQueries({ queryKey: ["league", leagueId] });
			qc.invalidateQueries({ queryKey: ["leagues"] });
		},
	});

	return (
		<form
			className="border-t px-4 py-4 text-sm"
			onSubmit={(e) => {
				e.preventDefault();
				if (matches) remove.mutate();
			}}
		>
			<p className="text-muted-foreground">
				Every member's picks, Locks of the Week, trash talk and the bot keys go
				with it. This can't be undone.
			</p>
			<label htmlFor="delete-confirm" className="mt-4 block">
				Type <span className="font-semibold">{leagueName}</span> to confirm.
			</label>
			<input
				id="delete-confirm"
				value={typed}
				onChange={(e) => {
					setTyped(e.target.value);
					remove.reset();
				}}
				autoComplete="off"
				autoCapitalize="off"
				autoCorrect="off"
				spellCheck={false}
				className="mt-2 w-full rounded-md border bg-background px-4 py-3 text-base outline-none ring-loss/30 focus:ring-4"
			/>
			<div className="mt-4 flex items-center justify-end gap-3">
				{remove.error && (
					<p className="mr-auto text-loss">{(remove.error as Error).message}</p>
				)}
				<button
					type="submit"
					disabled={!matches || remove.isPending}
					className="h-10 rounded-full bg-loss px-4 font-semibold text-white transition-[transform,opacity] active:scale-95 disabled:opacity-40"
				>
					{remove.isPending ? "Deleting…" : "Delete league"}
				</button>
			</div>
		</form>
	);
}
