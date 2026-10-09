import {
	boolean,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const scoringMode = pgEnum("scoring_mode", [
	"straight",
	"spread",
	"confidence",
]);
export const memberRole = pgEnum("member_role", ["commissioner", "member"]);
export const gameState = pgEnum("game_state", ["pre", "in", "post"]);

/** Mirrors Supabase auth.users; id is the auth user id. */
export const profiles = pgTable("profiles", {
	id: uuid().primaryKey(),
	displayName: text("display_name").notNull(),
	favoriteTeam: text("favorite_team"),
	avatarUrl: text("avatar_url"),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const leagues = pgTable("leagues", {
	id: uuid().primaryKey().defaultRandom(),
	name: text().notNull(),
	season: integer().notNull(),
	mode: scoringMode().notNull().default("straight"),
	/** pushValue, lockRule, tiebreaker etc. */
	settings: jsonb()
		.$type<{ pushValue?: number; lockRule?: "kickoff" | "first-sunday" }>()
		.default({})
		.notNull(),
	inviteCode: text("invite_code").notNull().unique(),
	createdBy: uuid("created_by")
		.notNull()
		.references(() => profiles.id),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const leagueMembers = pgTable(
	"league_members",
	{
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => profiles.id, { onDelete: "cascade" }),
		role: memberRole().notNull().default("member"),
		joinedAt: timestamp("joined_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
);

/** One row per NFL game, shared by every league. id is ESPN's event id. */
export const games = pgTable("games", {
	id: text().primaryKey(),
	season: integer().notNull(),
	week: integer().notNull(),
	kickoff: timestamp({ withTimezone: true }).notNull(),
	state: gameState().notNull().default("pre"),
	homeTeam: text("home_team").notNull(),
	awayTeam: text("away_team").notNull(),
	homeScore: integer("home_score").notNull().default(0),
	awayScore: integer("away_score").notNull().default(0),
	/** Latest home line from the feed; moves until lock. */
	currentSpread: real("current_spread"),
	/** Home line frozen at kickoff; ATS scoring uses only this. */
	lockedSpread: real("locked_spread"),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const picks = pgTable(
	"picks",
	{
		id: uuid().primaryKey().defaultRandom(),
		leagueId: uuid("league_id")
			.notNull()
			.references(() => leagues.id, { onDelete: "cascade" }),
		userId: uuid("user_id")
			.notNull()
			.references(() => profiles.id, { onDelete: "cascade" }),
		gameId: text("game_id")
			.notNull()
			.references(() => games.id),
		team: text().notNull(),
		confidence: integer(),
		/** Monday night total points guess, only on the tiebreaker game. */
		tiebreaker: integer(),
		isTiebreaker: boolean("is_tiebreaker").default(false).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(t) => [uniqueIndex("picks_unique").on(t.leagueId, t.userId, t.gameId)],
);
