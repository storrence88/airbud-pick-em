import type { SupabaseClient } from "@supabase/supabase-js";
import type { Game } from "#/lib/nfl/types";
import type { ReminderStyle } from "#/lib/profile";
import {
	dueSlate,
	easternTime,
	type ReminderChannel,
	type ReminderLeague,
	reminderMessage,
} from "#/lib/reminders";
import { getSupabaseAdminClient } from "#/lib/supabase.server";
import { syncWeek } from "./sync";

/** One member of one league with open picks on the day's games. */
export interface OpenPicks {
	leagueId: string;
	leagueName: string;
	userId: string;
	displayName: string;
	channel: ReminderChannel;
	style: ReminderStyle;
	games: Game[];
}

/**
 * Who in these leagues hasn't picked which of these games. Reads with the
 * secret key; callers only ever tell a player about their own open games.
 */
export async function openPicks(
	admin: SupabaseClient,
	leagues: { id: string; name: string }[],
	games: Game[],
): Promise<OpenPicks[]> {
	if (!leagues.length || !games.length) return [];
	const ids = leagues.map((l) => l.id);
	const [{ data: members, error }, { data: picks }] = await Promise.all([
		admin
			.from("league_members")
			.select(
				"league_id, user_id, profiles(display_name, reminder_channel, reminder_style)",
			)
			.in("league_id", ids),
		admin
			.from("picks")
			.select("league_id, user_id, game_id")
			.in("league_id", ids)
			.in(
				"game_id",
				games.map((g) => g.id),
			),
	]);
	if (error) throw new Error(error.message);
	const picked = new Set(
		(picks ?? []).map((p) => `${p.league_id}:${p.user_id}:${p.game_id}`),
	);
	const names = new Map(leagues.map((l) => [l.id, l.name]));
	return (members ?? []).flatMap((m) => {
		const p = m.profiles as unknown as {
			display_name: string;
			reminder_channel: ReminderChannel;
			reminder_style: ReminderStyle;
		} | null;
		const open = games.filter(
			(g) => !picked.has(`${m.league_id}:${m.user_id}:${g.id}`),
		);
		if (!open.length) return [];
		return [
			{
				leagueId: m.league_id,
				leagueName: names.get(m.league_id) ?? "Your league",
				userId: m.user_id,
				displayName: p?.display_name ?? "Player",
				channel: p?.reminder_channel ?? "email",
				style: p?.reminder_style ?? "gentle",
				games: open,
			},
		];
	});
}

const toLeague = (o: OpenPicks): ReminderLeague => ({
	name: o.leagueName,
	games: o.games.map((g) => ({ away: g.away.abbr, home: g.home.abbr })),
});

const escapeHtml = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] as string,
	);

/** Sends one email through Resend's HTTP API. */
async function sendEmail(
	to: string,
	subject: string,
	text: string,
	html: string,
) {
	const res = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: process.env.REMINDER_EMAIL_FROM,
			to,
			subject,
			text,
			html,
		}),
	});
	if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export const emailConfigured = () =>
	Boolean(process.env.RESEND_API_KEY && process.env.REMINDER_EMAIL_FROM);

/**
 * The scheduled email job. When a game day's first kickoff is a few hours
 * out, emails everyone who wants email reminders and has open picks that
 * day, once per day across all their leagues. Players who chose Discord DMs
 * but never signed in with Discord get an email instead. With `dryRun`, or
 * before email is configured, it only counts who would get one.
 */
export async function sendEmailReminders({
	now = new Date(),
	hours,
	dryRun = false,
	appUrl,
}: {
	now?: Date;
	hours?: number;
	dryRun?: boolean;
	appUrl: string;
}) {
	const admin = getSupabaseAdminClient();
	if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set.");
	const slate = dueSlate(await syncWeek(), now, hours);
	if (!slate?.games.length) return { slate: null };

	const { data: leagues } = await admin
		.from("leagues")
		.select("id, name")
		.eq("season", slate.games[0].season);
	const open = (await openPicks(admin, leagues ?? [], slate.games)).filter(
		(o) => o.channel !== "off",
	);
	const byUser = new Map<string, OpenPicks[]>();
	for (const o of open)
		byUser.set(o.userId, [...(byUser.get(o.userId) ?? []), o]);

	const send = !dryRun && emailConfigured();
	let due = 0;
	let sent = 0;
	let failed = 0;
	for (const [userId, rows] of byUser) {
		const { data } = await admin.auth.admin.getUserById(userId);
		const user = data.user;
		if (!user?.email) continue;
		const wantsDiscord = rows.some((r) => r.channel === "discord");
		const hasDiscord = user.identities?.some((i) => i.provider === "discord");
		// Discord folks get a DM from the bot instead, if they can.
		if (wantsDiscord && hasDiscord) continue;
		due++;
		if (!send) continue;

		// Claim the day first so overlapping runs never double-send.
		const { data: claimed } = await admin
			.from("reminder_log")
			.upsert(
				{ user_id: userId, slate: slate.id },
				{ onConflict: "user_id,slate", ignoreDuplicates: true },
			)
			.select("user_id");
		if (!claimed?.length) continue;

		const msg = reminderMessage({
			name: rows[0].displayName,
			style: rows[0].style,
			when: easternTime(slate.firstKickoff),
			leagues: rows.map(toLeague),
			seed: `${slate.id}:${userId}`,
		});
		const link = `${appUrl.replace(/\/$/, "")}/picks`;
		const text = `${msg.intro}\n\n${msg.games.join("\n")}\n\nMake your picks: ${link}\n\nChange or turn off reminders on your profile: ${appUrl.replace(/\/$/, "")}/profile`;
		const html = [
			`<p>${escapeHtml(msg.intro)}</p>`,
			`<p>${msg.games.map(escapeHtml).join("<br>")}</p>`,
			`<p><a href="${escapeHtml(link)}">Make your picks</a></p>`,
			`<p style="color:#888;font-size:12px">Change or turn off reminders on <a href="${escapeHtml(appUrl)}/profile">your profile</a>.</p>`,
		].join("");
		try {
			await sendEmail(user.email, msg.subject, text, html);
			sent++;
		} catch (err) {
			console.error("reminder email failed", err);
			failed++;
			// Give the day back so the next run can try again.
			await admin
				.from("reminder_log")
				.delete()
				.eq("user_id", userId)
				.eq("slate", slate.id);
		}
	}
	return {
		slate: { id: slate.id, firstKickoff: slate.firstKickoff },
		emailConfigured: emailConfigured(),
		dryRun: !send,
		due,
		sent,
		failed,
	};
}
