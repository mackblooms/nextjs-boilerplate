import AuthStatus from "./components/AuthStatus";

export default function Home() {
  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <AuthStatus />

      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
        BracketBall (Beta)
      </h1>

      <p style={{ marginBottom: 18, opacity: 0.9 }}>
        Friends-only pool for March Madness. Create a pool, share the link, draft
        teams under budget, and track the live leaderboard.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a
          href="/pools/new"
          style={{
            display: "inline-block",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            textDecoration: "none",
            fontWeight: 900,
          }}
        >
          Create a Pool
        </a>

        <a
          href="/profile"
          style={{
            display: "inline-block",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            textDecoration: "none",
            fontWeight: 900,
          }}
        >
          Profile
        </a>

        <a
          href="/login"
          style={{
            display: "inline-block",
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #ccc",
            textDecoration: "none",
            fontWeight: 900,
          }}
        >
          Login
        </a>
      </div>

      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
          This week’s checklist
        </h2>
        <ol style={{ lineHeight: 1.7, paddingLeft: 18, opacity: 0.9 }}>
          <li>Log in via magic link</li>
          <li>Set your display name in Profile</li>
          <li>Create a pool and share the link</li>
          <li>Join pool on a second account to test “friend flow”</li>
        </ol>
      </div>
    </main>
  );
}
