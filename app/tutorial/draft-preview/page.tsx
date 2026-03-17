import Link from "next/link";

type DemoTeam = {
  id: string;
  seed: number;
  name: string;
  cost: number;
};

const DEMO_TEAMS: DemoTeam[] = [
  { id: "duke", seed: 1, name: "Duke", cost: 22 },
  { id: "uconn", seed: 2, name: "UConn", cost: 19 },
  { id: "marquette", seed: 3, name: "Marquette", cost: 14 },
  { id: "baylor", seed: 4, name: "Baylor", cost: 12 },
  { id: "gonzaga", seed: 5, name: "Gonzaga", cost: 10 },
  { id: "dayton", seed: 7, name: "Dayton", cost: 7 },
  { id: "new-mexico", seed: 10, name: "New Mexico", cost: 5 },
];

export default function TutorialDraftPreviewPage() {
  return (
    <main style={{ maxWidth: 1000, margin: "48px auto", padding: 16, display: "grid", gap: 16 }}>
      <section
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 14,
          background: "var(--surface)",
          padding: 14,
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Demo Draft (Tutorial View)</h1>
            <p style={{ margin: 0, opacity: 0.8 }}>Preview only. No teams are selected in this example.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/drafts"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                textDecoration: "none",
                fontWeight: 800,
                background: "var(--surface)",
              }}
            >
              Back to Drafts
            </Link>
            <Link
              href="/pools"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-color)",
                textDecoration: "none",
                fontWeight: 800,
                background: "var(--surface)",
              }}
            >
              Open Pools
            </Link>
          </div>
        </div>
      </section>

      <section className="draft-editor-layout">
        <div
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "grid",
            gap: 8,
          }}
        >
          {DEMO_TEAMS.map((team) => (
            <label
              key={team.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                border: "1px solid var(--border-color)",
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <input type="checkbox" checked={false} readOnly aria-label={`${team.name} not selected`} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  ({team.seed}) {team.name}
                </span>
              </div>
              <b>{team.cost}</b>
            </label>
          ))}
        </div>

        <aside
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 14,
            background: "var(--surface)",
            padding: 14,
            display: "grid",
            gap: 10,
            alignContent: "start",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900 }}>Draft Summary</h2>
          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              padding: "10px 12px",
              background: "var(--surface-muted)",
              fontWeight: 800,
            }}
          >
            Selected teams: 0
            <br />
            Cost: 0 / 100
          </div>
          <div style={{ fontSize: 13, opacity: 0.78 }}>
            No teams selected yet. Pick teams on the left and save.
          </div>
          <button
            type="button"
            disabled
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-color)",
              background: "var(--surface)",
              fontWeight: 900,
              opacity: 0.65,
              cursor: "not-allowed",
            }}
          >
            Save Draft
          </button>
        </aside>
      </section>
    </main>
  );
}
