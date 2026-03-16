"use client";

import Image from "next/image";
import { type ReactNode, useMemo } from "react";

export type BracketBoardTeam = {
  id: string;
  name: string;
  seed_in_region: number | null;
  logo_url?: string | null;
};

export type BracketBoardGame = {
  id: string;
  round: string;
  region: string | null;
  slot: number;
  start_time?: string | null;
  game_date?: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
};

type RoundKey = "R64" | "R32" | "S16" | "E8";

const REGIONS = ["East", "West", "South", "Midwest"] as const;
type Region = (typeof REGIONS)[number];

const BRACKET_UNITS = 16;
const UNIT_PX = 44;
const GAME_SPAN = 2;

const isRegion = (value: string | null): value is Region =>
  value !== null && REGIONS.includes(value as Region);

const rowStartFor = (round: RoundKey, slot: number) => {
  if (round === "R64") return (slot - 1) * 2 + 1;
  if (round === "R32") return (slot - 1) * 4 + 2;
  if (round === "S16") return (slot - 1) * 8 + 4;
  return 8;
};

function formatGameTimeEst(g: BracketBoardGame | null | undefined): string | null {
  if (!g) return null;

  if (g.start_time) {
    const d = new Date(g.start_time);
    if (!Number.isNaN(d.getTime())) {
      return (
        d.toLocaleString("en-US", {
          timeZone: "America/New_York",
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }) + " ET"
      );
    }
  }

  if (g.game_date) {
    const d = new Date(`${g.game_date}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return (
        d.toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          weekday: "short",
          month: "short",
          day: "numeric",
        }) + " ET"
      );
    }
  }

  return null;
}

export function BracketBoard({
  teams,
  games,
  highlightTeamIds,
}: {
  teams: BracketBoardTeam[];
  games: BracketBoardGame[];
  highlightTeamIds: Set<string>;
}) {
  const teamById = useMemo(() => {
    const m = new Map<string, BracketBoardTeam>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);

  const byRoundByRegion = useMemo(() => {
    const out: Record<Region, Record<RoundKey, BracketBoardGame[]>> = {
      East: { R64: [], R32: [], S16: [], E8: [] },
      West: { R64: [], R32: [], S16: [], E8: [] },
      South: { R64: [], R32: [], S16: [], E8: [] },
      Midwest: { R64: [], R32: [], S16: [], E8: [] },
    };

    for (const g of games) {
      if (!isRegion(g.region)) continue;
      if (
        g.round === "R64" ||
        g.round === "R32" ||
        g.round === "S16" ||
        g.round === "E8"
      ) {
        out[g.region][g.round].push(g);
      }
    }

    for (const region of REGIONS) {
      for (const round of ["R64", "R32", "S16", "E8"] as const) {
        out[region][round].sort((a, b) => a.slot - b.slot);
      }
    }

    return out;
  }, [games]);

  const finalFour = useMemo(
    () => games.filter((g) => g.round === "F4").sort((a, b) => a.slot - b.slot),
    [games],
  );

  const championship = useMemo(
    () => games.find((g) => g.round === "CHIP"),
    [games],
  );

  const renderTeam = (teamId: string | null, winnerId: string | null) => {
    if (!teamId) {
      return (
        <span
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            padding: "6px 8px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            opacity: 0.6,
            fontWeight: 700,
          }}
        >
          <span>TBD</span>
          <span />
        </span>
      );
    }

    const t = teamById.get(teamId);
    const isHighlighted = highlightTeamIds.has(teamId);
    const isWinner = winnerId === teamId;

    return (
      <span
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          padding: "6px 8px",
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          background: isHighlighted ? "var(--highlight)" : "transparent",
          fontWeight: isWinner ? 900 : 700,
          alignItems: "center",
        }}
      >
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          {t?.logo_url ? (
            <Image
              src={t.logo_url}
              alt={t.name ?? "Team"}
              width={18}
              height={18}
              style={{ objectFit: "contain", flexShrink: 0 }}
              unoptimized
            />
          ) : (
            <span style={{ width: 18, height: 18, flexShrink: 0 }} />
          )}
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {t?.name ?? "Unknown"}
          </span>
        </span>
        <span
          style={{
            opacity: 0.75,
            flexShrink: 0,
            width: 22,
            textAlign: "right",
            whiteSpace: "nowrap",
            lineHeight: "18px",
          }}
        >
          {t?.seed_in_region ?? ""}
        </span>
      </span>
    );
  };

  const renderGameBox = (children: ReactNode, meta?: string | null) => (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 14,
        padding: 6,
        background: "var(--surface)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>{children}</div>
      {meta ? (
        <div
          style={{
            marginTop: 6,
            paddingTop: 5,
            borderTop: "1px solid var(--border-color)",
            fontSize: 10,
            fontWeight: 700,
            opacity: 0.72,
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={meta}
        >
          {meta}
        </div>
      ) : null}
    </div>
  );

  const renderSingleTeamBox = (
    teamId: string | null,
    winnerId: string | null,
  ) => (
    <div
      style={{
        border: "1px solid var(--border-color)",
        borderRadius: 14,
        padding: 6,
        background: "var(--surface)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
      }}
    >
      {renderTeam(teamId, winnerId)}
    </div>
  );

  const renderRegionBracket = (region: Region, reverse = false) => {
    const rounds = byRoundByRegion[region];

    const renderRoundColumn = (title: string, roundKey: RoundKey) => {
      const gamesForRound = rounds[roundKey] ?? [];

      return (
        <div style={{ minWidth: 260 }}>
          <div style={{ fontWeight: 900, marginBottom: 10, opacity: 0.9 }}>
            {title}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateRows: `repeat(${BRACKET_UNITS}, ${UNIT_PX}px)`,
              gap: 0,
            }}
          >
            {gamesForRound.map((g) => {
              const start = rowStartFor(roundKey, g.slot);
              const meta = formatGameTimeEst(g);
              return (
                <div
                  key={g.id}
                  style={{ gridRow: `${start} / span ${GAME_SPAN}` }}
                >
                  {renderGameBox(
                    <>
                      {renderTeam(g.team1_id, g.winner_team_id)}
                      {renderTeam(g.team2_id, g.winner_team_id)}
                    </>,
                    meta,
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <section
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 16,
          padding: 14,
          background: "var(--surface-muted)",
          minWidth: 4 * 260 + 3 * 16 + 40,
        }}
      >
        <div
          style={{
            fontWeight: 900,
            marginBottom: 12,
            textAlign: reverse ? "left" : "inherit",
          }}
        >
          {region}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(260px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {!reverse ? (
            <>
              {renderRoundColumn("Round of 64", "R64")}
              {renderRoundColumn("Round of 32", "R32")}
              {renderRoundColumn("Sweet 16", "S16")}
              {renderRoundColumn("Elite 8", "E8")}
            </>
          ) : (
            <>
              {renderRoundColumn("Elite 8", "E8")}
              {renderRoundColumn("Sweet 16", "S16")}
              {renderRoundColumn("Round of 32", "R32")}
              {renderRoundColumn("Round of 64", "R64")}
            </>
          )}
        </div>
      </section>
    );
  };

  return (
    <div
      style={{
        width: "max-content",
        minWidth: 3200,
        margin: "0 auto",
        display: "flex",
        gap: 18,
        alignItems: "center",
      }}
    >
      <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
        {renderRegionBracket("East")}
        {renderRegionBracket("South")}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 860,
        }}
      >
        <section
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 16,
            padding: 14,
            background: "var(--surface)",
            width: 860,
          }}
        >
          <div
            style={{
              fontWeight: 900,
              marginBottom: 12,
              fontSize: 16,
              textAlign: "center",
            }}
          >
            Final Four
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr minmax(280px, 320px) 1fr",
              gridTemplateRows:
                "minmax(56px, auto) minmax(96px, auto) minmax(56px, auto)",
              columnGap: 18,
              rowGap: 20,
              alignItems: "center",
            }}
          >
            <div style={{ gridColumn: 1, gridRow: 1 }}>
              {renderSingleTeamBox(
                finalFour[0]?.team1_id ?? null,
                finalFour[0]?.winner_team_id ?? null,
              )}
            </div>
            <div style={{ gridColumn: 3, gridRow: 1 }}>
              {renderSingleTeamBox(
                finalFour[0]?.team2_id ?? null,
                finalFour[0]?.winner_team_id ?? null,
              )}
            </div>
            <div style={{ gridColumn: 1, gridRow: 3 }}>
              {renderSingleTeamBox(
                finalFour[1]?.team1_id ?? null,
                finalFour[1]?.winner_team_id ?? null,
              )}
            </div>
            <div style={{ gridColumn: 3, gridRow: 3 }}>
              {renderSingleTeamBox(
                finalFour[1]?.team2_id ?? null,
                finalFour[1]?.winner_team_id ?? null,
              )}
            </div>

            <div
              style={{
                gridColumn: 2,
                gridRow: 2,
                alignSelf: "center",
                justifySelf: "center",
                width: "100%",
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  marginBottom: 10,
                  opacity: 0.9,
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                Championship
              </div>
              {renderGameBox(
                <>
                  {renderTeam(
                    championship?.team1_id ?? null,
                    championship?.winner_team_id ?? null,
                  )}
                  {renderTeam(
                    championship?.team2_id ?? null,
                    championship?.winner_team_id ?? null,
                  )}
                </>,
                formatGameTimeEst(championship),
              )}
            </div>
          </div>
        </section>
      </div>

      <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
        {renderRegionBracket("West", true)}
        {renderRegionBracket("Midwest", true)}
      </div>
    </div>
  );
}
