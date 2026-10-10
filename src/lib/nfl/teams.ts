// All 32 teams, for choosing a favorite. Abbreviations match ESPN's feed.

export interface NflTeam {
	abbr: string;
	name: string;
	color: string;
	altColor: string;
}

const t = (abbr: string, name: string, color: string, altColor: string) => ({
	abbr,
	name,
	color,
	altColor,
});

export const NFL_TEAMS: NflTeam[] = [
	t("ARI", "Arizona Cardinals", "#a40227", "#ffffff"),
	t("ATL", "Atlanta Falcons", "#a71930", "#000000"),
	t("BAL", "Baltimore Ravens", "#29126f", "#9e7c0c"),
	t("BUF", "Buffalo Bills", "#00338d", "#d50a0a"),
	t("CAR", "Carolina Panthers", "#0085ca", "#000000"),
	t("CHI", "Chicago Bears", "#0b1c3a", "#e64100"),
	t("CIN", "Cincinnati Bengals", "#fb4f14", "#000000"),
	t("CLE", "Cleveland Browns", "#472a08", "#ff3c00"),
	t("DAL", "Dallas Cowboys", "#002a5c", "#b0b7bc"),
	t("DEN", "Denver Broncos", "#0a2343", "#fc4c02"),
	t("DET", "Detroit Lions", "#0076b6", "#bbbbbb"),
	t("GB", "Green Bay Packers", "#204e32", "#ffb612"),
	t("HOU", "Houston Texans", "#03202f", "#a71930"),
	t("IND", "Indianapolis Colts", "#003b75", "#ffffff"),
	t("JAX", "Jacksonville Jaguars", "#007487", "#d7a22a"),
	t("KC", "Kansas City Chiefs", "#e31837", "#ffb612"),
	t("LV", "Las Vegas Raiders", "#000000", "#a5acaf"),
	t("LAC", "Los Angeles Chargers", "#0080c6", "#ffc20e"),
	t("LAR", "Los Angeles Rams", "#003594", "#ffd100"),
	t("MIA", "Miami Dolphins", "#008e97", "#fc4c02"),
	t("MIN", "Minnesota Vikings", "#4f2683", "#ffc62f"),
	t("NE", "New England Patriots", "#002244", "#c60c30"),
	t("NO", "New Orleans Saints", "#d3bc8d", "#000000"),
	t("NYG", "New York Giants", "#003c7f", "#c9243f"),
	t("NYJ", "New York Jets", "#115740", "#ffffff"),
	t("PHI", "Philadelphia Eagles", "#06424d", "#a5acaf"),
	t("PIT", "Pittsburgh Steelers", "#000000", "#ffb612"),
	t("SF", "San Francisco 49ers", "#aa0000", "#b3995d"),
	t("SEA", "Seattle Seahawks", "#002a5c", "#69be28"),
	t("TB", "Tampa Bay Buccaneers", "#bd1c36", "#3e3a35"),
	t("TEN", "Tennessee Titans", "#4b92db", "#0c2340"),
	t("WSH", "Washington Commanders", "#5a1414", "#ffb612"),
];

const byAbbr = new Map(NFL_TEAMS.map((team) => [team.abbr, team]));

export const teamByAbbr = (abbr: string | null | undefined) =>
	abbr ? byAbbr.get(abbr) : undefined;

export const teamLogo = (abbr: string) =>
	`https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;
