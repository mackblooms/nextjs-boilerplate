"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  CbbPlayerProjection,
  CbbProjectionPayload,
  CbbResearchPayload,
  CbbResearchPlayerWithState,
} from "@/lib/cbbPlayerProjections";
import {
  UiButton,
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

function formatDelta(value: number | null | undefined, current: number | null | undefined, digits = 1) {
  if (value == null || current == null || !Number.isFinite(value) || !Number.isFinite(current)) return "";
  const delta = value - current;
  if (Math.abs(delta) < 0.001) return "even";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(digits)}`;
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
  const [researchPayload, setResearchPayload] = useState<CbbResearchPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
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

      const { data: userData } = await supabase.auth.getUser();
      const signedInUserId = userData.user?.id ?? null;

      const headers = { authorization: `Bearer ${token}` };
      const [res, researchRes] = await Promise.all([
        fetch("/api/admin/cbb-player-projections", { headers }).catch(() => null),
        fetch("/api/admin/cbb-player-projection-research", { headers }).catch(() => null),
      ]);

      if (!res || !researchRes) {
        if (!canceled) {
          setError("Could not load player projections.");
          setLoading(false);
        }
        return;
      }

      if (!res.ok || !researchRes.ok) {
        const message =
          res.status === 403 || researchRes.status === 403
            ? signedInUserId
              ? `Not authorized. Add this user id to POOL_SITE_ADMIN_USER_IDS in .env.local: ${signedInUserId}`
              : "Not authorized. Only site admins can view this workspace."
            : "Could not load player projections.";
        if (!canceled) {
          setError(message);
          setLoading(false);
        }
        return;
      }

      const json = (await res.json()) as CbbProjectionPayload;
      const researchJson = (await researchRes.json()) as CbbResearchPayload;
      if (!canceled) {
        setPayload(json);
        setResearchPayload(researchJson);
        setLoading(false);
      }
    }

    void load();

    return () => {
      canceled = true;
    };
  }, []);

  const players = useMemo(() => payload?.players ?? [], [payload]);
  const researchPlayers = useMemo(() => researchPayload?.players ?? [], [researchPayload]);
  const typeOptions = useMemo(() => uniqueOptions(players, "playerType"), [players]);
  const classOptions = useMemo(() => uniqueOptions(players, "classYear"), [players]);
  const teamOptions = useMemo(() => uniqueOptions(players, "currentTeam"), [players]);
  const pendingResearchPlayers = useMemo(
    () => researchPlayers.filter((player) => !player.applied),
    [researchPlayers]
  );
  const visibleResearchPlayers = useMemo(() => pendingResearchPlayers.slice(0, 12), [pendingResearchPlayers]);

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

  async function applyResearchRows(sourceRows: number[]) {
    if (sourceRows.length === 0) return;

    setApplying(true);
    setApplyError("");
    setApplyMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setApplyError("Please log in with a site admin account to apply projections.");
      setApplying(false);
      return;
    }

    const res = await fetch("/api/admin/cbb-player-projection-research/apply", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sourceRows }),
    }).catch(() => null);

    if (!res) {
      setApplyError("Could not apply researched projections.");
      setApplying(false);
      return;
    }

    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      appliedRows?: number[];
      projections?: CbbProjectionPayload;
      research?: CbbResearchPayload;
    };

    if (!res.ok || !json.projections || !json.research) {
      setApplyError(json.error ?? "Could not apply researched projections.");
      setApplying(false);
      return;
    }

    setPayload(json.projections);
    setResearchPayload(json.research);
    setSelectedRows(new Set());
    setApplyMessage(`applied ${json.appliedRows?.length ?? sourceRows.length} researched projections`);
    setApplying(false);
  }

  function toggleResearchRow(sourceRow: number) {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(sourceRow)) {
        next.delete(sourceRow);
      } else {
        next.add(sourceRow);
      }
      return next;
    });
  }

  function selectVisibleResearchRows(rows: CbbResearchPlayerWithState[]) {
    setSelectedRows((current) => {
      const next = new Set(current);
      for (const player of rows) {
        if (!player.applied) next.add(player.sourceRow);
      }
      return next;
    });
  }

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

      <section className="cbb-research-review" aria-label="Research review queue">
        <div className="cbb-projections-board-head cbb-research-review-head">
          <div>
            <span className="cbb-projections-kicker">research queue</span>
            <h2>{researchPayload?.pendingCount ?? 0} pending suggestions</h2>
          </div>
          <div className="cbb-research-review-actions">
            <span>
              {researchPayload?.appliedCount ?? 0} applied · {researchPayload?.playerCount ?? 0} researched
            </span>
            <UiButton
              type="button"
              size="sm"
              onClick={() => selectVisibleResearchRows(visibleResearchPlayers)}
              disabled={applying || visibleResearchPlayers.length === 0}
            >
              select shown
            </UiButton>
            <UiButton
              type="button"
              size="sm"
              variant="success"
              onClick={() => void applyResearchRows(Array.from(selectedRows))}
              disabled={applying || selectedRows.size === 0}
            >
              {applying ? "applying..." : `apply selected (${selectedRows.size})`}
            </UiButton>
          </div>
        </div>

        {applyError ? (
          <UiStatus tone="error" className="cbb-research-review-status">
            {applyError}
          </UiStatus>
        ) : null}
        {applyMessage ? (
          <UiStatus tone="success" className="cbb-research-review-status">
            {applyMessage}
          </UiStatus>
        ) : null}

        {visibleResearchPlayers.length === 0 ? (
          <UiEmptyState
            as="div"
            title="all researched suggestions applied"
            description="new research batches will appear here when they are added."
          />
        ) : (
          <div className="cbb-research-grid">
            {visibleResearchPlayers.map((player) => {
              const selected = selectedRows.has(player.sourceRow);
              return (
                <article className="cbb-research-card" key={`${player.batchId}-${player.sourceRow}`}>
                  <label className="cbb-research-card-select">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleResearchRow(player.sourceRow)}
                      disabled={applying}
                    />
                    <span>
                      row {player.sourceRow} · {player.batchId}
                    </span>
                  </label>

                  <div className="cbb-research-card-main">
                    <div>
                      <h3>{player.player}</h3>
                      <p>
                        {player.currentTeam ?? "-"} from {player.previousTeam ?? "-"}
                      </p>
                    </div>
                    <strong>{formatNumber(player.suggested.projectedBbpr, 2)}</strong>
                  </div>

                  <div className="cbb-research-card-metrics">
                    <div>
                      <span>starter</span>
                      <strong>{player.suggested.projectedStarter ?? "-"}</strong>
                    </div>
                    <div>
                      <span>role</span>
                      <strong>{formatInteger(player.suggested.projectedRole)}</strong>
                      <small>{formatDelta(player.suggested.projectedRole, player.currentProjection?.projectedRole)}</small>
                    </div>
                    <div>
                      <span>opp</span>
                      <strong>{formatInteger(player.suggested.opportunityChange)}</strong>
                      <small>
                        {formatDelta(
                          player.suggested.opportunityChange,
                          player.currentProjection?.opportunityChange
                        )}
                      </small>
                    </div>
                    <div>
                      <span>burden</span>
                      <strong>{formatInteger(player.suggested.offensiveBurden)}</strong>
                    </div>
                    <div>
                      <span>nba</span>
                      <strong>{formatInteger(player.suggested.nbaProjectionScore)}</strong>
                    </div>
                    <div>
                      <span>upside</span>
                      <strong>{formatInteger(player.suggested.upsideToolsScore)}</strong>
                    </div>
                  </div>

                  <p className="cbb-research-summary">{player.researchSummary}</p>

                  <div className="cbb-research-context">
                    <span>{player.teamContext.starterEvidence ?? "researched role context"}</span>
                    <span>{player.teamContext.roleCap ?? "role cap applied from roster context"}</span>
                  </div>

                  <div className="cbb-research-evidence">
                    {player.evidence.slice(0, 3).map((item) => (
                      <a href={item.url} key={`${player.sourceRow}-${item.url}`} target="_blank" rel="noreferrer">
                        {item.source}
                      </a>
                    ))}
                  </div>

                  <UiButton
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => void applyResearchRows([player.sourceRow])}
                    disabled={applying}
                    fullWidth
                  >
                    apply this projection
                  </UiButton>
                </article>
              );
            })}
          </div>
        )}
      </section>

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
