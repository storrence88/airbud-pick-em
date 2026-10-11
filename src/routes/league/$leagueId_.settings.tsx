import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { BotAccess } from "#/components/BotAccess";
import { DeleteLeague } from "#/components/DeleteLeague";
import { RemoveMember } from "#/components/RemoveMember";
import { TransferCommissioner } from "#/components/TransferCommissioner";
import { SCORING_MODES } from "#/lib/scoring";
import { cn } from "#/lib/utils";
import {
	leagueSettingsQuery,
	PUSH_VALUES,
	updateLeagueSettings,
} from "#/server/leagues";

export const Route = createFileRoute("/league/$leagueId_/settings")({
	beforeLoad: ({ context, location }) => {
		if (!context.user)
			throw redirect({ to: "/login", search: { next: location.href } });
	},
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(leagueSettingsQuery(params.leagueId)),
	component: LeagueSettings,
	errorComponent: ({ error }) => (
		<main className="mx-auto max-w-3xl px-4 py-16 text-muted-foreground">
			{(error as Error).message}
		</main>
	),
});

type PushValue = (typeof PUSH_VALUES)[number];

const PUSH_LABELS: Record<PushValue, string> = { 0: "0", 0.5: "½", 1: "1" };

function LeagueSettings() {
	const { leagueId } = Route.useParams();
	const { data } = useSuspenseQuery(leagueSettingsQuery(leagueId));
	const { league, isCommissioner, members, userId } = data;

	return (
		<main className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
			<Link
				to="/league/$leagueId"
				params={{ leagueId }}
				className="-ml-2 inline-flex h-9 max-w-full items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4 shrink-0" aria-hidden />
				<span className="truncate">{league.name}</span>
			</Link>
			<h1 className="mt-2 font-display text-3xl font-bold uppercase sm:text-4xl">
				League settings
			</h1>
			{isCommissioner ? (
				<>
					<SettingsForm key={league.id} />
					<BotAccess leagueId={leagueId} />
					<RemoveMember leagueId={leagueId} members={members} userId={userId} />
					<TransferCommissioner
						leagueId={leagueId}
						members={members}
						userId={userId}
					/>
					<DeleteLeague leagueId={leagueId} leagueName={league.name} />
				</>
			) : (
				<p className="mt-6 rounded-lg border bg-card px-4 py-3 text-muted-foreground">
					Only the commissioner can change this league's settings.
				</p>
			)}
		</main>
	);
}

function SettingsForm() {
	const { leagueId } = Route.useParams();
	const qc = useQueryClient();
	const { data } = useSuspenseQuery(leagueSettingsQuery(leagueId));
	const { league } = data;
	const savedPush = (league.settings.pushValue ?? 0) as PushValue;
	const [name, setName] = useState(league.name);
	const [pushValue, setPushValue] = useState<PushValue>(savedPush);
	const [justSaved, setJustSaved] = useState(false);

	const dirty = name.trim() !== league.name || pushValue !== savedPush;

	const save = useMutation({
		mutationFn: () =>
			updateLeagueSettings({ data: { leagueId, name, pushValue } }),
		onSuccess: (updated) => {
			setName(updated.name);
			setJustSaved(true);
			// The week, standings and leagues list all show the name or score with the push value.
			qc.invalidateQueries({ queryKey: ["league", leagueId] });
			qc.invalidateQueries({ queryKey: ["leagues"] });
		},
	});

	useEffect(() => {
		if (!justSaved) return;
		const t = setTimeout(() => setJustSaved(false), 1800);
		return () => clearTimeout(t);
	}, [justSaved]);

	const mode = SCORING_MODES[league.mode];

	return (
		<form
			className="mt-8 grid gap-4"
			onSubmit={(e) => {
				e.preventDefault();
				if (dirty && name.trim()) save.mutate();
			}}
		>
			<Section title="League name">
				<input
					id="league-name"
					aria-label="League name"
					value={name}
					maxLength={60}
					onChange={(e) => setName(e.target.value)}
					className="w-full rounded-md border bg-background px-4 py-3 text-lg outline-none ring-ring/40 focus:ring-4"
				/>
			</Section>
			<Section title="Scoring">
				<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
					<span className="font-display text-xl font-semibold">
						{mode.label}
					</span>
					<span className="text-xs font-semibold uppercase tracking-wider text-primary">
						{mode.tagline}
					</span>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					The scoring mode is set when the league is created.
				</p>
				{league.mode === "spread" && (
					<div className="mt-5 border-t pt-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="font-semibold">Points for a push</div>
								<p className="text-sm text-muted-foreground">
									When a team wins by exactly the spread.
								</p>
							</div>
							<Segmented
								value={pushValue}
								onChange={setPushValue}
								options={PUSH_VALUES}
							/>
						</div>
						<p className="mt-3 text-xs text-muted-foreground">
							Standings use this for the whole season, including weeks already
							played.
						</p>
					</div>
				)}
			</Section>
			<div className="flex items-center justify-end gap-3">
				{save.error && (
					<p className="mr-auto text-sm text-loss">
						{(save.error as Error).message}
					</p>
				)}
				<AnimatePresence>
					{justSaved && !dirty && (
						<motion.span
							initial={{ opacity: 0, x: 6 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0 }}
							className="flex items-center gap-1 text-sm font-semibold text-primary"
						>
							<Check className="size-4" aria-hidden /> Saved
						</motion.span>
					)}
				</AnimatePresence>
				<button
					type="submit"
					disabled={!dirty || !name.trim() || save.isPending}
					className="h-11 rounded-full bg-primary px-6 font-semibold text-primary-foreground transition-[transform,opacity] active:scale-95 disabled:opacity-50"
				>
					{save.isPending ? "Saving…" : "Save changes"}
				</button>
			</div>
		</form>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="rounded-lg border bg-card p-4">
			<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{title}
			</h2>
			{children}
		</section>
	);
}

function Segmented({
	value,
	onChange,
	options,
}: {
	value: PushValue;
	onChange: (v: PushValue) => void;
	options: readonly PushValue[];
}) {
	return (
		<fieldset className="relative inline-flex shrink-0 rounded-full border bg-background p-1 text-sm font-semibold">
			<legend className="sr-only">Points for a push</legend>
			{options.map((v) => (
				<button
					key={v}
					type="button"
					aria-pressed={value === v}
					onClick={() => onChange(v)}
					className={cn(
						"relative h-9 min-w-12 rounded-full px-3 tabular-nums transition-colors",
						value === v ? "text-primary-foreground" : "text-muted-foreground",
					)}
				>
					{value === v && (
						<motion.span
							layoutId="push-value"
							className="absolute inset-0 rounded-full bg-primary"
							transition={{ type: "spring", stiffness: 400, damping: 32 }}
						/>
					)}
					<span className="relative">
						{PUSH_LABELS[v]} {v === 1 ? "pt" : "pts"}
					</span>
				</button>
			))}
		</fieldset>
	);
}
