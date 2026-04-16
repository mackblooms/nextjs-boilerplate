"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type ImportResult = {
  ok: boolean;
  imported?: number;
  error?: string;
};

const COLUMN_ALIASES: Record<string, string> = {
  previousPpg: "previous_ppg",
  previousRpg: "previous_rpg",
  previousApg: "previous_apg",
  previous3P: "previous_3p",
  previousFg: "previous_fg",
  previousFt: "previous_ft",
  previousBpg: "previous_bpg",
  previousSpg: "previous_spg",
  previousMpg: "previous_mpg",
  priorPpg: "prior_ppg",
  priorRpg: "prior_rpg",
  priorApg: "prior_apg",
  prior3P: "prior_3p",
  priorFg: "prior_fg",
  priorFt: "prior_ft",
  priorBpg: "prior_bpg",
  priorSpg: "prior_spg",
  coachSuccess: "coach_success",
  systemFit: "system_fit",
  roleOpportunity: "role_opportunity",
  baselineMomentum: "baseline_momentum",
  improvementScore: "improvement_score",
};

function tryParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((cell) => cell.trim());
  const rows = [] as Record<string, unknown>[];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, unknown> = {};

    for (let j = 0; j < header.length; j += 1) {
      const key = header[j];
      if (!key) continue;
      row[key] = cells[j] ?? null;
    }

    rows.push(row);
  }

  return rows;
}

function normalizeRawRow(rawRow: unknown) {
  if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) return null;

  const row: Record<string, unknown> = {};
  for (const [inputKey, rawValue] of Object.entries(rawRow)) {
    const normalizedKey = COLUMN_ALIASES[inputKey] ?? inputKey;
    if (typeof normalizedKey !== "string" || !normalizedKey) continue;

    row[normalizedKey] = rawValue;
  }

  return row;
}

function parseImportRows(text: string) {
  const candidate = tryParseJson(text);
  if (candidate && Array.isArray(candidate)) {
    return candidate.map(normalizeRawRow).filter(Boolean) as Record<string, unknown>[];
  }

  const csvRows = parseCsv(text);
  if (csvRows.length > 0) {
    return csvRows.map(normalizeRawRow).filter(Boolean) as Record<string, unknown>[];
  }

  return [];
}

export default function AdminPlayerImport() {
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setStatusMessage(null);
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFileName(null);
      return;
    }

    setSelectedFileName(file.name);
    const text = await file.text();
    setSourceText(text);

    const rows = parseImportRows(text);
    setPreviewCount(rows.length);
  };

  const handleSubmit = async () => {
    setStatusMessage(null);
    setLoading(true);
    setPreviewCount(null);

    try {
      const rows = parseImportRows(sourceText);
      if (rows.length === 0) {
        throw new Error("No importable player rows found. Submit valid JSON array or CSV data.");
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Your auth session is missing. Refresh the page and try again.");

      const res = await fetch("/api/admin/import-players", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Import failed.");
      }

      const imported = Number(json.imported ?? rows.length);
      setStatusMessage(`Imported ${imported} players successfully.`);
      setPreviewCount(imported);
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details style={{ border: "1px solid var(--border-color)", borderRadius: 12, padding: 16, background: "var(--surface-muted)" }}>
      <summary style={{ fontSize: 18, fontWeight: 900, cursor: "pointer" }}>
        NCAA player dataset import
      </summary>

      <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          Upload a JSON or CSV dataset containing college basketball player metadata and historical stats. The import will populate the `players` table used by the auto lookup and projection engine.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 700 }}>
            Select file
            <input type="file" accept=".csv,.json" onChange={handleFileChange} style={{ cursor: "pointer" }} />
          </label>
          <button type="button" onClick={handleSubmit} disabled={loading || !sourceText} style={{ minWidth: 140, padding: "10px 14px", borderRadius: 8, fontWeight: 700 }}>
            {loading ? "Importing…" : "Import dataset"}
          </button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontWeight: 700 }}>Paste JSON or CSV data</label>
          <textarea
            rows={10}
            value={sourceText}
            onChange={(event) => {
              setSourceText(event.target.value);
              setSelectedFileName(null);
              const rows = parseImportRows(event.target.value);
              setPreviewCount(rows.length);
            }}
            placeholder="Paste JSON array or CSV text here"
            style={{ width: "100%", minHeight: 220, padding: 12, borderRadius: 12, border: "1px solid var(--border-color)", background: "var(--surface)" }}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontWeight: 700 }}>File:</span>
            <span>{selectedFileName ?? "No file selected"}</span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontWeight: 700 }}>Preview rows:</span>
            <span>{previewCount === null ? "—" : previewCount}</span>
          </div>
          <div style={{ color: statusMessage?.startsWith("Imported") ? "var(--success-foreground)" : "var(--danger-foreground)", fontWeight: 700 }}>
            {statusMessage}
          </div>
        </div>

        <div style={{ fontSize: 13, color: "var(--muted-foreground)", borderTop: "1px solid var(--border-color)", paddingTop: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Accepted field names</div>
          <div>
            name, team, position, age, year, coach, system, role,
            previous_ppg, previous_rpg, previous_apg, previous_3p, previous_fg, previous_ft, previous_bpg, previous_spg, previous_mpg,
            prior_ppg, prior_rpg, prior_apg, prior_3p, prior_fg, prior_ft, prior_bpg, prior_spg,
            coach_success, system_fit, role_opportunity, baseline_momentum, improvement_score
          </div>
          <div style={{ marginTop: 8 }}>
            CamelCase field names like <code>previousPpg</code> and <code>baselineMomentum</code> are accepted too.
          </div>
        </div>
      </div>
    </details>
  );
}
