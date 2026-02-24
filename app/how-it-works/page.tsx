export default function HowItWorksPage() {
  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>
        How bracketball Works
      </h1>

      <p style={{ marginTop: 0, opacity: 0.85 }}>
        Everything you need to know about drafting, scoring, and tie-breakers.
      </p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>Quick Summary</h2>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>Each player drafts teams within a fixed budget.</li>
          <li>Your score is the sum of points your drafted teams earn.</li>
          <li>Teams earn more points the further they advance.</li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>Draft Rules</h2>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li><b>Budget:</b> $100 total (example — update if different).</li>
          <li><b>Roster limits:</b> (ex: max 2 one-seeds, max 2 two-seeds, max 4 12-seeds).</li>
          <li><b>Draft lock:</b> picks lock at tip-off of the first game (or when commissioner locks).</li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>Scoring</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Points are awarded based on the <b>furthest round a team reaches</b>.
        </p>

        <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", fontWeight: 900, background: "#fafafa" }}>
            <div>Round Reached</div>
            <div style={{ textAlign: "right" }}>Points</div>
          </div>

          {[
            ["Round of 64 (Win 1)", "X"],
            ["Round of 32 (Win 2)", "X"],
            ["Sweet 16", "X"],
            ["Elite 8", "X"],
            ["Final Four", "X"],
            ["Champion", "X"],
          ].map(([label, pts]) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", borderTop: "1px solid #f1f1f1" }}>
              <div>{label}</div>
              <div style={{ textAlign: "right", fontWeight: 900 }}>{pts}</div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 10, opacity: 0.8 }}>
          Replace the X’s with your real scoring values.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>Tie-breakers</h2>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>Total points (obviously).</li>
          <li>If tied: most Final Four teams drafted.</li>
          <li>If still tied: most Championship teams drafted.</li>
          <li>If still tied: split pot (or commissioner decides).</li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>FAQ / Edge Cases</h2>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li><b>Play-in teams:</b> once decided, the winner inherits the slot and scoring.</li>
          <li><b>Vacated wins / forfeits:</b> scoring follows official bracket advancement.</li>
          <li><b>Scoring updates:</b> automated via SportsDataIO when games go Final.</li>
        </ul>
      </section>

      <div style={{ marginTop: 30 }}>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 12px",
            border: "1px solid #ccc",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 900,
          }}
        >
          Back to Home
        </a>
      </div>
    </main>
  );
}