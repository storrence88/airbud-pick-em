import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ChevronDown, Copy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "#/lib/utils";
import { botKeysQuery, createBotKey, revokeBotKey } from "#/server/botKeys";

/** Commissioner-only panel for creating and revoking Discord bot API keys. */
export function BotAccess({ leagueId }: { leagueId: string }) {
	const [open, setOpen] = useState(false);
	return (
		<section className="mt-10 rounded-lg border bg-card">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				className="flex w-full items-center gap-3 px-4 py-3 text-left"
			>
				<Bot className="size-5 text-muted-foreground" aria-hidden />
				<span className="flex-1">
					<span className="block font-semibold">Discord bot access</span>
					<span className="block text-sm text-muted-foreground">
						Let a Discord bot show this league's games and picks.
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
						<Keys leagueId={leagueId} />
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

function Keys({ leagueId }: { leagueId: string }) {
	const qc = useQueryClient();
	const query = botKeysQuery(leagueId);
	const { data: keys = [], isLoading } = useQuery(query);
	const [name, setName] = useState("");
	const [newKey, setNewKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const create = useMutation({
		mutationFn: () =>
			createBotKey({ data: { leagueId, name: name.trim() || "Discord bot" } }),
		onSuccess: (key) => {
			setNewKey(key);
			setName("");
			qc.invalidateQueries({ queryKey: query.queryKey });
		},
	});
	const revoke = useMutation({
		mutationFn: (id: string) => revokeBotKey({ data: { id } }),
		onSuccess: () => qc.invalidateQueries({ queryKey: query.queryKey }),
	});
	const error = create.error ?? revoke.error;

	return (
		<div className="border-t px-4 py-4 text-sm">
			<p className="text-muted-foreground">
				A key works for this league only and can't change anything. The bot sees
				each game's picks once it kicks off, and who hasn't picked yet before
				then, never what they picked.
			</p>
			{newKey && (
				<div className="mt-4 rounded-md border border-primary/50 bg-primary/5 p-3">
					<div className="font-semibold">
						Copy this key now. It won't be shown again.
					</div>
					<div className="mt-2 flex items-center gap-2">
						<code className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1.5 font-mono text-xs">
							{newKey}
						</code>
						<button
							type="button"
							onClick={async () => {
								await navigator.clipboard.writeText(newKey);
								setCopied(true);
								setTimeout(() => setCopied(false), 1500);
							}}
							className="grid size-9 shrink-0 place-items-center rounded-full border hover:bg-muted"
							aria-label="Copy key"
						>
							{copied ? (
								<Check className="size-4 text-primary" />
							) : (
								<Copy className="size-4" />
							)}
						</button>
					</div>
				</div>
			)}
			<form
				className="mt-4 flex gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					create.mutate();
				}}
			>
				<input
					value={name}
					maxLength={40}
					onChange={(e) => setName(e.target.value)}
					placeholder="Discord bot"
					aria-label="Key name"
					className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 outline-none ring-ring/40 focus:ring-4"
				/>
				<button
					type="submit"
					disabled={create.isPending}
					className="h-10 shrink-0 rounded-full bg-primary px-4 font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
				>
					New key
				</button>
			</form>
			{error && <p className="mt-2 text-loss">{(error as Error).message}</p>}
			<ul className="mt-4 grid gap-2">
				{isLoading && <li className="text-muted-foreground">Loading keys…</li>}
				{!isLoading && keys.length === 0 && (
					<li className="text-muted-foreground">No keys yet.</li>
				)}
				{keys.map((k) => (
					<li
						key={k.id}
						className="flex items-center gap-3 rounded-md border px-3 py-2"
					>
						<span className="min-w-0 flex-1">
							<span className="block truncate font-medium">{k.name}</span>
							<span className="block text-xs text-muted-foreground">
								<code className="font-mono">{k.key_prefix}…</code> ·{" "}
								{k.last_used_at
									? `last used ${new Date(k.last_used_at).toLocaleDateString()}`
									: "never used"}
							</span>
						</span>
						<button
							type="button"
							onClick={() => revoke.mutate(k.id)}
							disabled={revoke.isPending}
							className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-loss hover:bg-muted"
						>
							Revoke
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}
