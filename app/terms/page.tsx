import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | bracketball",
  description: "Terms of Service for using bracketball.",
};

const containerStyle = {
  maxWidth: 900,
  margin: "40px auto",
  padding: "0 16px",
  lineHeight: 1.6,
};

const sectionStyle = {
  marginTop: 24,
  padding: 16,
  border: "1px solid var(--border-color)",
  borderRadius: 12,
  background: "var(--surface)",
};

export default function TermsPage() {
  return (
    <main style={containerStyle}>
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Terms of Service</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>Last updated: March 24, 2026</p>
      <p style={{ marginTop: 18 }}>
        These Terms of Service govern your use of bracketball. By creating an account or using
        the site, you agree to these terms.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>1. Eligibility and Accounts</h2>
        <p>
          You are responsible for maintaining the security of your account credentials and for any
          activity under your account.
        </p>
        <p style={{ marginBottom: 0 }}>
          You must provide accurate account information and keep your login details private.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>2. Acceptable Use</h2>
        <p>You agree not to misuse the platform, including attempts to:</p>
        <ul style={{ marginBottom: 0 }}>
          <li>interfere with or disrupt service operation,</li>
          <li>access data or accounts you are not authorized to access,</li>
          <li>upload malicious code or abuse automated scraping tools.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>3. Content and Platform Changes</h2>
        <p>
          We may update features, scoring logic, and platform behavior over time. We may suspend or
          terminate accounts that violate these terms.
        </p>
        <p style={{ marginBottom: 0 }}>
          Tournament names, team names, and related marks remain the property of their respective
          owners.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>4. Disclaimers and Liability</h2>
        <p>
          The service is provided on an &quot;as is&quot; and &quot;as available&quot; basis. We
          do not guarantee uninterrupted access, error-free operation, or data availability at all
          times.
        </p>
        <p style={{ marginBottom: 0 }}>
          To the fullest extent allowed by law, bracketball is not liable for indirect, incidental,
          or consequential damages arising from your use of the service.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>5. Contact and Policy Updates</h2>
        <p>
          We may revise these terms from time to time. Continued use after an update means you
          accept the revised terms.
        </p>
        <p style={{ marginBottom: 0 }}>
          For privacy details, see our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}
