"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AdminPlayerFetch() {
  const [season, setSeason] = useState(String(new Date().getUTCFullYear()));
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runFetch = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Auth session is missing. Refresh the page and try again.");

      const payload: Record<string, unknown> = { season: Number(season) };
      if (sourceUrl.trim()) payload.url = sourceUrl.trim();

      const res = await fetch("/api/admin/fetch-players", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Fetch failed.");
      }

      setMessage(`Imported ${json.imported ?? 0} players from remote source.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details style={{ border: "1px solid var(--border-color)", borderRadius: 12, padding: 16, background: "var(--surface-muted)" }}>
      <summary style={{ fontSize: 18, fontWeight: 900, cursor: "pointer" }}>
        Auto fetch player data from remote source
      </summary>

      <div style={{ marginTop: 16, display: "grid", gap: 16 }}>
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          Pull NCAA player stats automatically from a configured remote source. If you have a SportsDataIO key, the app will use the default PlayerSeasonStats endpoint.
        </p>

        <div style={{ display: "grid", gap: 10, maxWidth: 560 }}>
          <label style={{ display: "grid", gap: 6 }}>
            Season
            <input
              type="number"
              min={2000}
              max={2100}
              value={season}
              onChange={(event) => setSeason(event.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--surface)" }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Source URL (optional)
            <input
              type="text"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://example.com/players?season={season}&key={key}"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border-color)", background: "var(--surface)" }}
            />
          </label>

          <button
            type="button"
            onClick={runFetch}
            disabled={loading}
            style={{ width: 180, padding: "10px 14px", borderRadius: 8, fontWeight: 700 }}
          >
            {loading ? "Fetching…" : "Fetch players"}
          </button>

          {message ? <div style={{ color: "var(--success-foreground)", fontWeight: 700 }}>{message}</div> : null}
          {error ? <div style={{ color: "var(--danger-foreground)", fontWeight: 700 }}>{error}</div> : null}

          <div style={{ fontSize: 13, color: "var(--muted-foreground)" }}>
            If you leave Source URL blank, the connector will use the default SportsDataIO player endpoint via your configured `SPORTS_DATA_IO_KEY` or `SPORTSDATAIO_KEY`.
          </div>
        </div>
      </div>
    </details>
  );
}
