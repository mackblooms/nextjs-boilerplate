"use client";

import { useEffect, useMemo, useState } from "react";
import { UiButton, UiCard, UiEmptyState, UiInput, UiLoadingState, UiSelect, UiStatus } from "../components/ui/primitives";
import { SEASON_DRAFT_STORAGE_KEY, canCompleteSeasonSquad, parseSeasonDraft, seasonPickBlockReason, seasonPricing, seasonSquadSummary, type SeasonTeam } from "@/lib/cbbSeason";
import styles from "./season.module.css";

const percentage = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function SeasonSquadBuilder({ teams }: { teams: SeasonTeam[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState("My season squad");
  const [query, setQuery] = useState("");
  const [band, setBand] = useState(-1);
  const [conference, setConference] = useState("");
  const [sort, setSort] = useState("percentage");
  const [onlySelected, setOnlySelected] = useState(false);
  const [visible, setVisible] = useState(36);
  const [loaded, setLoaded] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [storageIssue, setStorageIssue] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);

  const selected = useMemo(() => selectedIds.map(id => teams.find(t => t.id === id)!).filter(Boolean), [selectedIds, teams]);
  const summary = seasonSquadSummary(selected);
  const needsRebalance = !canCompleteSeasonSquad(selected, teams);
  const canSave = summary.remaining >= 0 && summary.slotsRemaining >= 0;
  const conferences = useMemo(() => [...new Set(teams.map(t => t.conference))].sort(), [teams]);

  useEffect(() => {
    // Read only after hydration. Saving is explicit so recovery never overwrites a draft.
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(SEASON_DRAFT_STORAGE_KEY);
        if (raw) {
          const draft = parseSeasonDraft(raw, teams);
          setSelectedIds(draft.teamIds);
          setName(draft.name);
          setHasSaved(true);
          const repriced = JSON.parse(raw).version !== seasonPricing.version;
          setDirty(repriced);
          setMessage({ tone: "info", text: repriced ? "Your saved picks are restored with the new 15-team prices. Review the updated budget and team count before saving. Your original draft has not been overwritten." : "Your saved draft is restored from this device." });
        }
      } catch {
        setStorageIssue(true);
        setMessage({ tone: "error", text: "Your saved draft couldn’t be restored, or browser storage is unavailable. It has not been overwritten. You can still explore the builder." });
      } finally { setLoaded(true); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [teams]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const filtered = useMemo(() => teams.filter(t =>
    (!query || normalize(`${t.name} ${t.conference}`).includes(normalize(query.trim())))
    && (band === -1 || t.bandIndex === band) && (!conference || t.conference === conference)
    && (!onlySelected || selectedIds.includes(t.id)))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name)
      : sort === "cost" ? a.cost - b.cost || a.name.localeCompare(b.name)
      : b.projectedWins / (b.projectedWins + b.projectedLosses) - a.projectedWins / (a.projectedWins + a.projectedLosses) || a.name.localeCompare(b.name)),
  [teams, query, band, conference, onlySelected, selectedIds, sort]);

  function toggle(team: SeasonTeam) {
    const removing = selectedIds.includes(team.id);
    const reason = removing ? null : seasonPickBlockReason(team, selected);
    if (reason) { setMessage({ tone: "error", text: reason }); return; }
    setSelectedIds(ids => removing ? ids.filter(id => id !== team.id) : [...ids, team.id]);
    setDirty(true);
    setConfirmReset(false);
    setMessage({ tone: "info", text: `${team.name} ${removing ? "removed from" : "added to"} your squad. Save to keep your changes.` });
  }

  function save() {
    if (!canSave) {
      setMessage({ tone: "error", text: "Remove picks until you have no more than 15 teams and are within 100 points before saving this updated draft." });
      return;
    }
    try {
      window.localStorage.setItem(SEASON_DRAFT_STORAGE_KEY, JSON.stringify({ version: seasonPricing.version, name: name.trim() || "My season squad", teamIds: selectedIds }));
      setName(name.trim() || "My season squad");
      setDirty(false);
      setHasSaved(true);
      setStorageIssue(false);
      setMessage({ tone: "success", text: summary.complete ? "Your complete preview squad is saved on this device. No contest entry has been submitted." : needsRebalance ? "Draft saved on this device. This mix needs a swap before it can meet all squad requirements." : "Draft saved on this device. You can finish your squad later." });
    } catch {
      setMessage({ tone: "error", text: "This browser couldn’t save your draft. Your picks are still here; keep this page open and try again." });
    }
  }

  function reset() {
    setSelectedIds([]); setDirty(true); setConfirmReset(false);
    setMessage({ tone: "info", text: "Builder cleared. Your previous saved draft stays unchanged until you save again." });
  }

  function clearFilters() { setQuery(""); setBand(-1); setConference(""); setOnlySelected(false); setVisible(36); }

  return <>
    <UiStatus tone="info"><strong>Season preview</strong> · Build a {seasonPricing.squadSize}-team squad with exactly 100 points. Drafts save only in this browser; prices and rules are still under review. This is not a live contest entry.</UiStatus>
    <div className={styles.budgetBar} aria-label="Squad budget">
      <div><small>{summary.remaining < 0 ? "POINTS OVER BUDGET" : "POINTS LEFT"}</small><strong>{Math.abs(summary.remaining)}<span> / 100</span></strong></div>
      <div><small>YOUR TEAMS</small><strong>{selected.length}<span> / {seasonPricing.squadSize}</span></strong></div>
      <div className={styles.budgetProjection}><small>PROJECTED WIN %</small><strong>{percentage(summary.percentage)}</strong></div>
      <a className={styles.squadJump} href="#season-squad">View squad ↓</a>
      <progress className={styles.budgetProgress} max={100} value={Math.min(summary.spent, 100)} aria-label={`${summary.spent} of 100 points spent`} />
    </div>
    <div className={styles.builder}>
      <section className={styles.board} aria-labelledby="team-board-title" id="season-teams">
        <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>SCOUT THE FIELD</span><h2 id="team-board-title">The team board</h2></div><span>{teams.length} teams</span></div>
        <div className={styles.filters}>
          <label><span>Search teams</span><UiInput type="search" placeholder="Find a school or conference…" value={query} onChange={e => { setQuery(e.target.value); setVisible(36); }} /></label>
          <label><span>Conference</span><UiSelect value={conference} onChange={e => { setConference(e.target.value); setVisible(36); }}><option value="">All conferences</option>{conferences.map(c => <option key={c}>{c}</option>)}</UiSelect></label>
          <label><span>Sort by</span><UiSelect value={sort} onChange={e => setSort(e.target.value)}><option value="percentage">Projected win %</option><option value="name">Team name</option><option value="cost">Price: low to high</option></UiSelect></label>
        </div>
        <div className={styles.bandFilters} role="group" aria-label="Filter by price band">
          <button type="button" aria-pressed={band === -1} onClick={() => { setBand(-1); setVisible(36); }}>All teams</button>
          {seasonPricing.bands.map((b, i) => <button type="button" key={b.id} data-band={b.id} aria-pressed={band === i} onClick={() => { setBand(i); setVisible(36); }}>{b.label}<span>{b.cost} pts</span></button>)}
        </div>
        <div className={styles.resultHeading}><span>{filtered.length} {filtered.length === 1 ? "team" : "teams"} found</span><label><input type="checkbox" checked={onlySelected} onChange={e => { setOnlySelected(e.target.checked); setVisible(36); }} /> My picks only</label></div>
        {!loaded ? <UiLoadingState title="Restoring your squad" description="Checking for a draft saved on this device." /> : filtered.length === 0 ? <UiEmptyState title={onlySelected ? "No matching squad picks" : "No teams found"} description="Try another school, conference, or price band." actions={<UiButton onClick={clearFilters}>Show all teams</UiButton>} /> : <>
          <div className={styles.teamGrid}>{filtered.slice(0, visible).map(team => {
            const owned = selectedIds.includes(team.id);
            const b = seasonPricing.bands[team.bandIndex];
            const reason = owned ? null : seasonPickBlockReason(team, selected);
            return <UiCard as="article" key={team.id} className={styles.teamCard} data-selected={owned} data-band={b.id}>
              <div className={styles.teamTopline}><span className={styles.bandTag}>{b.label}</span><strong className={styles.price}>{team.cost}<small> pts</small></strong></div>
              <div className={styles.teamIdentity}><span className={styles.teamMonogram} aria-hidden="true">{team.name.split(" ").map(w => w[0]).slice(0, 2).join("")}</span><div><h3>{team.name}</h3><span>{team.conference}</span></div></div>
              <div className={styles.teamRecord}><span>Projected record<strong>{team.projectedWins}–{team.projectedLosses}</strong></span><span>Win percentage<strong>{percentage(team.projectedWins / (team.projectedWins + team.projectedLosses))}</strong></span></div>
              <UiButton variant={owned ? "success" : "secondary"} fullWidth onClick={() => toggle(team)} disabled={Boolean(reason)} aria-label={`${owned ? "Remove" : "Add"} ${team.name}${reason ? `: ${reason}` : ""}`}>{owned ? "✓ Selected · remove" : "+ Add to squad"}</UiButton>
              {reason ? <small className={styles.blockReason}>{reason}</small> : null}
            </UiCard>;
          })}</div>
          {filtered.length > visible ? <UiButton className={styles.showMore} onClick={() => setVisible(n => n + 36)}>Show more teams ({filtered.length - visible} remaining)</UiButton> : null}
        </>}
        <p className={styles.sourceNote}>Projected overall records: <a href="https://barttorvik.com/trankpre.php" target="_blank" rel="noreferrer">Bart Torvik’s 2026–27 preseason table</a>, from the supplied PDF snapshot. These are projections, not live results. Snapshot date and full schedule coverage have not been verified.</p>
      </section>
      <aside className={styles.squadColumn} id="season-squad" aria-labelledby="season-squad-title">
        <UiCard className={styles.squadCard}>
          <div className={styles.sectionHeading}><div><span className={styles.eyebrow}>YOUR SEASON STARTS HERE</span><h2 id="season-squad-title">Your squad</h2></div><span className={styles.privateBadge}>Device only</span></div>
          <label className={styles.nameLabel}><span>Squad name</span><UiInput value={name} maxLength={60} disabled={!loaded} onChange={e => { setName(e.target.value); setDirty(true); }} /></label>
          <div className={styles.squadProjection}><span>PROJECTED COMBINED RECORD</span><strong>{selected.length ? `${summary.wins}–${summary.losses}` : "—"}</strong><span>{percentage(summary.percentage)} projected win percentage</span></div>
          <div className={styles.requirements} aria-label="Squad requirements">{seasonPricing.bands.map((b, i) => <div key={b.id} data-met={summary.counts[i] >= b.min && summary.counts[i] <= b.max}><span>{b.label} <small>{b.min ? `${b.min}–${b.max} required` : `up to ${b.max}`}</small></span><strong>{summary.counts[i]} / {b.max}</strong></div>)}</div>
          {needsRebalance ? <UiStatus tone="warning"><strong>Your mix needs a swap.</strong> Finish with exactly {seasonPricing.squadSize} teams and 100 points, including at least 4 Value and 5 Long-shot teams. Remove or swap picks to meet all three requirements.</UiStatus> : null}
          <div className={styles.completion} data-complete={summary.complete}>{summary.complete ? `✓ Squad ready · ${seasonPricing.squadSize} teams · all 100 points spent` : needsRebalance ? "Draft in progress · adjust your mix before completing your squad." : `Choose ${summary.slotsRemaining} more ${summary.slotsRemaining === 1 ? "team" : "teams"} with your remaining ${summary.remaining} points and meet the band requirements.`}</div>
          <UiButton variant="primary" fullWidth disabled={!loaded || !dirty || !canSave} onClick={save}>{!loaded ? "Loading draft…" : !canSave ? "Adjust squad to save" : dirty ? "Save draft on this device" : hasSaved ? "Draft saved on this device" : "Choose teams to start"}</UiButton>
          <p className={styles.saveNote}>Private to this browser. No account sync or contest submission. You can keep editing during this preview.</p>
          {message ? <div role={message.tone === "error" ? "alert" : "status"} aria-live="polite"><UiStatus tone={message.tone}>{message.text}</UiStatus></div> : null}
          {storageIssue ? <p className={styles.saveNote}>Saving a new draft will replace any previous draft stored by this preview.</p> : null}
          {!selected.length ? <UiEmptyState title="Who’s on your squad?" description="Start with a favorite or find a team everyone else overlooked." /> : <div className={styles.squadList}>{seasonPricing.bands.map((b, i) => {
            const picks = selected.filter(t => t.bandIndex === i);
            return picks.length ? <section key={b.id}><h3>{b.label} <span>{picks.length}</span></h3>{picks.map(team => <div className={styles.squadTeam} key={team.id}><div><strong>{team.name}</strong><small>{team.projectedWins}–{team.projectedLosses} projected · {team.cost} pts</small></div><UiButton size="sm" variant="ghost" aria-label={`Remove ${team.name} from squad`} onClick={() => toggle(team)}>×</UiButton></div>)}</section> : null;
          })}</div>}
          {selected.length ? confirmReset ? <div className={styles.resetActions}><span>Clear the current picks?</span><UiButton size="sm" variant="danger" onClick={reset}>Clear picks</UiButton><UiButton size="sm" onClick={() => setConfirmReset(false)}>Keep squad</UiButton></div> : <UiButton variant="ghost" onClick={() => setConfirmReset(true)}>Start over</UiButton> : null}
          <a className={styles.backToBoard} href="#season-teams">Back to team board ↑</a>
        </UiCard>
      </aside>
    </div>
    <UiCard className={styles.rules} id="season-rules"><span className={styles.eyebrow}>THE SEASON FORMAT</span><h2>Pick once. Follow all season.</h2><div className={styles.ruleGrid}><div><strong>{seasonPricing.squadSize} teams. Exactly 100 points.</strong><p>Everyone builds the same-sized squad. Prices reflect projected winning percentage, with purchase limits keeping favorites and underdogs in the mix.</p></div><div><strong>Every official game matters</strong><p>The planned contest pools all wins and losses, including non-Division I games, through conference tournaments.</p></div><div><strong>One squad. No upkeep.</strong><p>The planned contest locks squads before opening tipoff and reveals them together. No transfers or weekly lineups.</p></div></div><p className={styles.sourceNote}>This builder is a preview. Contest registration, a confirmed lock time, shared reveals, live scores, and league standings are not open yet.</p></UiCard>
  </>;
}
