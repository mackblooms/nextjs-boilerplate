"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CbbPlayerProjection, CbbProjectionPayload } from "@/lib/cbbPlayerProjections";
import {
  UiEmptyState,
  UiErrorState,
  UiInput,
  UiLoadingState,
  UiSelect,
  UiStatus,
} from "@/app/components/ui/primitives";

type SortKey = "rank" | "player" | "team" | "projectedBbpr" | "confidence" | "review";

function formatNumber(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function formatInteger(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "-";
  return String(Math.round(value));
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function uniqueOptions(players: CbbPlayerProjection[], key: keyof CbbPlayerProjection) {
  return Array.from(
    new Set(
      players
        .map((player) => player[key])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function compareNullableNumber(a: number | null, b: number | null, direction: "asc" | "desc") {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return direction === "asc" ? a - b : b - a;
}

function sortPlayers(players: CbbPlayerProjection[], sortKey: SortKey) {
  const sorted = [...players];
  sorted.sort((a, b) => {
    if (sortKey === "player") return a.player.localeCompare(b.player);
    if (sortKey === "team") return (a.currentTeam ?? "").localeCompare(b.currentTeam ?? "");
    if (sortKey === "projectedBbpr") return compareNullableNumber(a.projectedBbpr, b.projectedBbpr, "desc");
    if (sortKey === "confidence") return compareNullableNumber(a.confidenceScore, b.confidenceScore, "desc");
    if (sortKey === "review") return Number(b.needsReview) - Number(a.needsReview);
    return compareNullableNumber(a.rank, b.rank, "asc");
  });
  return sorted;
}

export default function CbbPlayerProjectionsPage() {
  const [payload, setPayload] = useState<CbbProjectionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("rank");

  useEffect(() => {
    let canceled = false;

    async function load() {
      setLoading(true);
      setError("");

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (sessionErr || !token) {
        if (!canceled) {
          setError("Please log in with a site admin account to view player projections.");
          setLoading(false);
        }
        return;
      }

      const res = await fetch("/api/admin/cbb-player-projections", {
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (!res) {
        if (!canceled) {
          setError("Could not load player projections.");
          setLoading(false);
        }
        return;
      }

      if (!res.ok) {
        const message =
          res.status === 403
            ? "Not authorized. Only site admins can view this workspace."
            : "Could not load player projections.";
        if (!canceled) {
          setError(message);
          setLoading(false);
        }
        return;
      }

      const json = (await res.json()) as CbbProjectionPayload;
      if (!canceled) {
        setPayload(json);
        setLoading(false);
      }
    }

    void load();

    return () => {
      canceled = true;
    };
  }, []);

  const players = useMemo(() => payload?.players ?? [], [payload]);
  const typeOptions = useMemo(() => uniqueOptions(players, "playerType"), [players]);
  const classOptions = useMemo(() => uniqueOptions(players, "classYear"), [players]);
  const teamOptions = useMemo(() => uniqueOptions(players, "currentTeam"), [players]);

  const filteredPlayers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = players.filter((player) => {
      const matchesQuery =
        !needle ||
        player.player.toLowerCase().includes(needle) ||
        (player.currentTeam ?? "").toLowerCase().includes(needle) ||
        (player.previousTeam ?? "").toLowerCase().includes(needle);

      const matchesType = typeFilter === "all" || player.playerType === typeFilter;
      const matchesClass = classFilter === "all" || player.classYear === classFilter;
      const matchesTeam = teamFilter === "all" || player.currentTeam === teamFilter;
      const matchesReview =
        reviewFilter === "all" ||
        (reviewFilter === "needs-review" && player.needsReview) ||
        (reviewFilter === "ready" && !player.needsReview);

      return matchesQuery && matchesType && matchesClass && matchesTeam && matchesReview;
    });

    return sortPlayers(filtered, sortKey);
  }, [players, query, typeFilter, classFilter, teamFilter, reviewFilter, sortKey]);

  if (loading) {
    return (
      <main className="page-shell cbb-projections-shell">
        <UiLoadingState
          title="loading cbb projections"
          description="checking admin access and preparing the player board."
        />
      </main>
    );
  }

  if (error) {
    return (
      <main className="page-shell cbb-projections-shell">
        <UiErrorState title="admin access required" description={error} />
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="page-shell cbb-projections-shell">
        <UiErrorState title="projection data unavailable" description="Run the CBB projection import and try again." />
      </main>
    );
  }

  return (
    <main className="page-shell cbb-projections-shell">
      <section className="cbb-projections-hero" aria-label="College basketball player projections">
        <div>
          <span className="cbb-projections-kicker">admin workspace</span>
          <h1>cbb player projections</h1>
          <p>
            {payload.model.rankingSeason ?? "upcoming season"} board generated from the spreadsheet model.
          </p>
        </div>
        <div className="cbb-projections-meta">
          <span>updated {formatDateTime(payload.generatedAt)}</span>
          <span>model {payload.model.version ?? "draft"}</span>
        </div>
      </section>

      <section className="cbb-projections-stats" aria-label="Projection summary">
        <div>
          <span>players</span>
          <strong>{payload.summary.playerCount}</strong>
        </div>
        <div>
          <span>projected</span>
          <strong>{payload.summary.projectedCount}</strong>
        </div>
        <div>
          <span>needs review</span>
          <strong>{payload.summary.needsReviewCount}</strong>
        </div>
        <div>
          <span>source</span>
          <strong>{payload.model.historicalDataSources ?? "spreadsheet"}</strong>
        </div>
      </section>

      <section className="cbb-projections-toolbar" aria-label="Projection filters">
        <div className="cbb-projections-search">
          <label htmlFor="cbb-player-search">search</label>
          <UiInput
            id="cbb-player-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="player, team, previous team"
          />
        </div>
        <label>
          <span>type</span>
          <UiSelect value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">all types</option>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </UiSelect>
        </label>
        <label>
          <span>class</span>
          <UiSelect value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
            <option value="all">all classes</option>
            {classOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </UiSelect>
        </label>
        <label>
          <span>team</span>
          <UiSelect value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
            <option value="all">all teams</option>
            {teamOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </UiSelect>
        </label>
        <label>
          <span>status</span>
          <UiSelect value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
            <option value="all">all statuses</option>
            <option value="ready">ready</option>
            <option value="needs-review">needs review</option>
          </UiSelect>
        </label>
        <label>
          <span>sort</span>
          <UiSelect value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="rank">rank</option>
            <option value="projectedBbpr">projected bbpr</option>
            <option value="confidence">confidence</option>
            <option value="review">review status</option>
            <option value="player">player</option>
            <option value="team">team</option>
          </UiSelect>
        </label>
      </section>

      <UiStatus tone="info" className="cbb-projections-note">
        {payload.model.historicalPlayerBlend} · {payload.model.newcomerBlend}
      </UiStatus>

      <section className="cbb-projections-board" aria-label="Player projection board">
        <div className="cbb-projections-board-head">
          <div>
            <span className="cbb-projections-kicker">player board</span>
            <h2>{filteredPlayers.length} shown</h2>
          </div>
          <span>{payload.summary.projectedCount} projected bbpr values</span>
        </div>

        {filteredPlayers.length === 0 ? (
          <UiEmptyState
            as="div"
            title="no players match"
            description="clear a filter or search for a broader team/player name."
          />
        ) : (
          <div className="cbb-projections-table-wrap">
            <table className="cbb-projections-table">
              <thead>
                <tr>
                  <th>rank</th>
                  <th>player</th>
                  <th>team</th>
                  <th>type</th>
                  <th>proj bbpr</th>
                  <th>projection</th>
                  <th>opportunity</th>
                  <th>talent</th>
                  <th>confidence</th>
                  <th>status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map((player) => (
                  <tr key={player.id} data-review={player.needsReview}>
                    <td>{player.rank ?? "-"}</td>
                    <td>
                      <strong>{player.player}</strong>
                      <span>
                        {player.position ?? "-"} · {player.classYear ?? "-"}
                      </span>
                    </td>
                    <td>
                      <strong>{player.currentTeam ?? "-"}</strong>
                      {player.previousTeam ? <span>from {player.previousTeam}</span> : <span>upcoming roster</span>}
                    </td>
                    <td>{player.playerType ?? "-"}</td>
                    <td className="cbb-projections-score">{formatNumber(player.projectedBbpr, 2)}</td>
                    <td>{formatNumber(player.projectionScore, 2)}</td>
                    <td>{formatNumber(player.opportunityScore)}</td>
                    <td>{formatNumber(player.talentScore)}</td>
                    <td>
                      <strong>{player.confidenceGrade ?? "-"}</strong>
                      <span>{formatInteger(player.confidenceScore)}</span>
                    </td>
                    <td>
                      <span className="cbb-projections-status" data-review={player.needsReview}>
                        {player.needsReview ? "needs review" : "ready"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
