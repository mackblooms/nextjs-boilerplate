export default function HowItWorksPage() {
  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>🏀 BracketPool Scoring System</h1>

      <p style={{ marginTop: 0, lineHeight: 1.6 }}>
        BracketPool is scored <b>per game won</b>. Every tournament win by a team you drafted adds points cumulatively.
      </p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>📊 Base Points Per Win</h2>    
            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", fontWeight: 900, background: "#fafafa" }}>
            <div>Round Won</div>
            <div style={{ textAlign: "right" }}>Points</div>
          </div>

          {[
            ["Round of 64", "12"],
            ["Round of 32", "36"],
            ["Sweet 16", "84"],
            ["Elite 8", "180"],
            ["Final Four", "300"],
            ["Championship", "360"],
          ].map(([label, pts]) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr 140px", padding: "10px 12px", borderTop: "1px solid #f1f1f1" }}>
              <div>{label}</div>
              <div style={{ textAlign: "right", fontWeight: 900 }}>{pts}</div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 10, opacity: 0.85 }}>
          A champion that wins all 6 games earns 972 base points before bonuses.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>🔥 Upset Bonus</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Upset Bonus = <b>12 × (Team Seed − Opponent Seed)</b>, minimum 0.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>📈 Seed Multiplier</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Base points are multiplied by seed value from 1.00x (1-seed) up to 1.525x (16-seed).
          Multipliers apply to base points only.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>🏆 Historic Upset Bonus</h2>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>14-seed first Round of 64 win: <b>+144</b></li>
          <li>15-seed first Round of 64 win: <b>+240</b></li>
          <li>16-seed first Round of 64 win: <b>+336</b></li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>🧮 Final Scoring Per Win</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          <b>Win Score = (Base Round Points × Seed Multiplier) + Upset Bonus + Historic Bonus (if applicable)</b>
        </p>
      </section>
    </main>
  );
}