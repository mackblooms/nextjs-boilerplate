import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "support | bracketball",
  description: "support and troubleshooting help for bracketball.",
};

const containerStyle = {
  maxWidth: 900,
};

export default function SupportPage() {
  return (
    <main className="page-shell legal-doc" style={containerStyle}>
      <h1 className="page-title" style={{ fontSize: 34, fontWeight: 900 }}>
        Support
      </h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>Updated: March 28, 2026</p>
      <p style={{ marginTop: 18 }}>
        Need help with bracketball? This page is the best place to start for account issues,
        pool problems, draft questions, and app review contact details.
      </p>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>1. Fastest Way To Reach Us</h2>
        <p>
          Email{" "}
          <a href="mailto:mack@bracketball.io?subject=bracketball%20support">
            mack@bracketball.io
          </a>{" "}
          for support.
        </p>
        <p style={{ marginBottom: 0 }}>
          Include your device, browser or iPhone model, the pool name, and a screenshot if
          possible. That usually makes troubleshooting much faster.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>2. Common Issues</h2>
        <p>
          <b>Login or password reset:</b> try the email link again from the same device and
          browser where you requested it.
        </p>
        <p>
          <b>Pool join issues:</b> confirm the pool password and make sure the pool has not
          locked for entries.
        </p>
        <p>
          <b>Draft not showing up:</b> save the draft first, then return to Pools and reopen
          the entry picker.
        </p>
        <p style={{ marginBottom: 0 }}>
          <b>Scores or standings look stale:</b> pull to refresh or reopen the page after live
          results update.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>3. What To Include In A Bug Report</h2>
        <ul style={{ marginBottom: 0 }}>
          <li>what you expected to happen,</li>
          <li>what actually happened,</li>
          <li>your device and OS version,</li>
          <li>the pool or draft involved,</li>
          <li>screenshots or screen recording if available.</li>
        </ul>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>4. Review And Legal Links</h2>
        <p>
          App Review and user-support requests can use this page as the primary support URL.
        </p>
        <p style={{ marginBottom: 0 }}>
          For legal details, see <Link href="/terms">Terms of Service</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}
