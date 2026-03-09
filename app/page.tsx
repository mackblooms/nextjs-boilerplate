import Image from "next/image";
import Link from "next/link";

const buttonStyle = {
  display: "inline-block",
  padding: "12px 16px",
  borderRadius: 10,
  border: "1px solid var(--border-color)",
  textDecoration: "none",
  fontWeight: 800,
  minWidth: 170,
  textAlign: "center" as const,
};

export default function Home() {
  return (
    <main
      style={{
        maxWidth: 900,
        margin: "48px auto",
        padding: 16,
        display: "grid",
        justifyItems: "center",
        textAlign: "center",
        gap: 20,
      }}
    >
      <Image
        src="/pool-logo.svg"
        alt="bracketball logo"
        width={560}
        height={206}
        priority
        style={{ width: "min(100%, 560px)", height: "auto" }}
      />

      <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>
        bracketball (beta)
      </h1>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Link href="/how-it-works" style={buttonStyle}>
          How it works
        </Link>
        <Link href="/pools/new" style={buttonStyle}>
          Create a pool
        </Link>
        <Link href="/login" style={buttonStyle}>
          Login / Sign up
        </Link>
      </div>
    </main>
  );
}
