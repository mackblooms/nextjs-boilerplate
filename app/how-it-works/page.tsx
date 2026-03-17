import Link from "next/link";

const SEED_COSTS: Array<[number, number]> = [
  [1, 22],
  [2, 19],
  [3, 14],
  [4, 12],
  [5, 10],
  [6, 8],
  [7, 7],
  [8, 6],
  [9, 6],
  [10, 5],
  [11, 4],
  [12, 4],
  [13, 3],
  [14, 3],
  [15, 2],
  [16, 1],
];

export default function HowItWorksPage() {
  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>
        Bracketball: How It Works
      </h1>

      <p style={{ marginTop: 0, lineHeight: 1.6 }}>
        This page starts with draft budget rules, then scoring rules.
      </p>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>
          1) Draft Budget: 100 Total Points
        </h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Every entry gets <b>100 points</b> to spend in the draft. Team cost is
          based on seed rank. Higher-ranked teams (1-seeds) cost more and
          lower-ranked teams (16-seeds) cost less.
        </p>

        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 140px",
              padding: "10px 12px",
              fontWeight: 900,
              background: "var(--surface-muted)",
            }}
          >
            <div>Seed Rank</div>
            <div style={{ textAlign: "right" }}>Draft Cost</div>
          </div>

          {SEED_COSTS.map(([seed, cost]) => (
            <div
              key={seed}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px",
                padding: "10px 12px",
                borderTop: "1px solid var(--border-color)",
              }}
            >
              <div>{seed}-seed</div>
              <div style={{ textAlign: "right", fontWeight: 900 }}>{cost}</div>
            </div>
          ))}
        </div>

        <p style={{ marginTop: 10, opacity: 0.85 }}>
          Example: a 1-seed costs 22 points, while a 16-seed costs 1 point.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>2) Base Points Per Win</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Scoring is <b>per game won</b>. Every tournament win by a team you
          drafted adds points cumulatively.
        </p>

        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 140px",
              padding: "10px 12px",
              fontWeight: 900,
              background: "var(--surface-muted)",
            }}
          >
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
            <div
              key={label}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 140px",
                padding: "10px 12px",
                borderTop: "1px solid var(--border-color)",
              }}
            >
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
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>3) Upset Bonus</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Upset Bonus = <b>4 x (Team Seed - Opponent Seed)</b>, minimum 0.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>4) Seed Multiplier</h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          Base points are multiplied by seed value from 1.00x (1-seed) up to
          1.525x (16-seed). Multipliers apply to base points only.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>
          5) Historic Upset Bonus
        </h2>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>
            14-seed first Round of 64 win: <b>+24</b>
          </li>
          <li>
            15-seed first Round of 64 win: <b>+40</b>
          </li>
          <li>
            16-seed first Round of 64 win: <b>+56</b>
          </li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>
          6) Perfect Round of 64 Bonus
        </h2>
        <p style={{ marginTop: 10, lineHeight: 1.6 }}>
          If <b>all</b> of your drafted teams win in the Round of 64, you earn a
          bonus equal to the sum of your teams&apos; seeds. This applies to Round
          of 64 only.
        </p>
        <p style={{ marginTop: 10, lineHeight: 1.6, opacity: 0.85 }}>
          Your draft does not need to spend exactly 100 points. Any valid draft
          at or under the 100-point budget can qualify.
        </p>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>
            Example draft: <b>1, 1, 2, 2, 9, 10, 12, 14</b>
          </li>
          <li>
            Perfect Round of 64 bonus:{" "}
            <b>1 + 1 + 2 + 2 + 9 + 10 + 12 + 14 = 51 points</b>
          </li>
          <li>If any drafted team loses in that round, no bonus is awarded.</li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>7) Draft Caps</h2>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>Max 2 one-seeds</li>
          <li>Max 2 two-seeds</li>
          <li>Max 6 combined seeds 14-16</li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>8) Tie-breakers</h2>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>Total points (obviously).</li>
          <li>If tied: most Final Four teams drafted.</li>
          <li>If still tied: most Championship teams drafted.</li>
          <li>If still tied: split pot (or commissioner decides).</li>
        </ul>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 900 }}>9) FAQ / Edge Cases</h2>
        <ul style={{ marginTop: 10, lineHeight: 1.6 }}>
          <li>
            <b>Play-in teams:</b> once decided, the winner inherits the slot and
            scoring.
          </li>
          <li>
            <b>Vacated wins / forfeits:</b> scoring follows official bracket
            advancement.
          </li>
          <li>
            <b>Scoring updates:</b> automated via SportsDataIO when games go Final.
          </li>
        </ul>
      </section>

      <div style={{ marginTop: 30 }}>
        <Link
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 12px",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            textDecoration: "none",
            fontWeight: 900,
          }}
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
