import AuthStatus from "./components/AuthStatus";

export default function Home() {
  return (
    <main style={{ maxWidth: 900, margin: "48px auto", padding: 16 }}>
      <AuthStatus />

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>
        BracketBall (Beta)
      </h1>
      <p style={{ marginBottom: 24 }}>
        If you can sign in successfully, we’re ready to build pools + drafting.
      </p>

      <div style={{ display: "flex", gap: 12 }}>
        <a
          href="/login"
          style={{
            padding: "10px 14px",
            border: "1px solid #ccc",
            borderRadius: 10,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Go to Login
        </a>
      </div>
    </main>
  );
}
