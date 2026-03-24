import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | bracketball",
  description: "Privacy Policy for using bracketball.",
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

export default function PrivacyPage() {
  return (
    <main style={containerStyle}>
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Privacy Policy</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>Last updated: March 24, 2026</p>
      <p style={{ marginTop: 18 }}>
        This Privacy Policy describes how bracketball collects, uses, and protects information when
        you use the site.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>1. Information We Collect</h2>
        <p>We collect information needed to provide the service, including:</p>
        <ul style={{ marginBottom: 0 }}>
          <li>account details such as email address and authentication identifiers,</li>
          <li>profile information you choose to provide,</li>
          <li>gameplay data such as drafts, pool participation, and picks.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>2. How We Use Information</h2>
        <p>We use collected information to:</p>
        <ul style={{ marginBottom: 0 }}>
          <li>create and secure your account,</li>
          <li>operate pools, drafts, standings, and related features,</li>
          <li>improve reliability, performance, and overall user experience.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>3. Sharing and Disclosure</h2>
        <p>
          We do not sell personal data. We may share limited data with service providers needed to
          host, secure, and operate the platform.
        </p>
        <p style={{ marginBottom: 0 }}>
          We may also disclose information when required by law or to protect platform integrity.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>4. Data Retention and Security</h2>
        <p>
          We retain data as needed to provide the service and meet legitimate operational,
          compliance, and security needs.
        </p>
        <p style={{ marginBottom: 0 }}>
          We use reasonable safeguards, but no method of storage or transmission is completely
          secure.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>5. Your Choices</h2>
        <p>
          You can update profile details in your account and request account deletion where
          available.
        </p>
        <p style={{ marginBottom: 0 }}>
          Your use of bracketball is also governed by our <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </main>
  );
}
