import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "privacy policy | bracketball",
  description: "privacy policy for using bracketball.",
};

const containerStyle = {
  maxWidth: 900,
};

export default function PrivacyPage() {
  return (
    <main className="page-shell legal-doc" style={containerStyle}>
      <h1 className="page-title" style={{ fontSize: 34, fontWeight: 900 }}>
        Privacy Policy
      </h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>Effective Date: March 24, 2026</p>
      <p style={{ marginTop: 18 }}>
        bracketball values your privacy. This policy explains how we collect, use, share, and
        protect your information when you use the platform.
      </p>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>1. Information We Collect</h2>
        <p>Depending on your use of the platform, we may collect:</p>
        <p style={{ marginBottom: 0 }}>
          <b>Account and profile information:</b> email address, authentication identifiers, avatar,
          display name, and other profile fields you choose to provide.
          <br />
          <b>Notification data:</b> mobile push notification tokens, device-level notification
          preferences, and notification delivery metadata when you enable notifications.
          <br />
          <b>Gameplay and competition data:</b> drafts, picks, entries, pools joined, standings,
          and related game activity.
          <br />
          <b>Usage and technical data:</b> interactions with the platform, approximate location
          signals (like IP-derived region), browser/device information, and system logs.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>2. How We Use Information</h2>
        <p>We use information to:</p>
        <ul style={{ marginBottom: 0 }}>
          <li>provide and operate bracketball features, contests, and account services,</li>
          <li>calculate scores, standings, and competition outcomes,</li>
          <li>secure accounts, detect abuse, and maintain platform integrity,</li>
          <li>analyze usage and improve reliability, performance, and user experience,</li>
          <li>send optional push notifications you choose to receive,</li>
          <li>communicate important service, account, or policy updates.</li>
        </ul>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>3. Sharing of Information</h2>
        <p>
          We do not sell your personal information. We may share limited information with service
          providers that help us host, secure, and operate bracketball.
        </p>
        <p style={{ marginBottom: 0 }}>
          We may also disclose information when required by law, legal process, or when needed to
          enforce Terms, prevent fraud, or protect users and the platform.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>4. Cookies and Similar Technologies</h2>
        <p>
          We may use cookies, local storage, and similar technologies to keep you signed in, store
          preferences, improve functionality, and analyze usage patterns.
        </p>
        <p style={{ marginBottom: 0 }}>
          If you disable certain browser storage features, parts of bracketball may not function as
          intended.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>5. Data Security</h2>
        <p>
          We use reasonable administrative, technical, and organizational safeguards to protect
          information.
        </p>
        <p style={{ marginBottom: 0 }}>
          No method of storage or transmission is completely secure, and we cannot guarantee
          absolute security.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>6. Data Retention</h2>
        <p>
          We retain information as needed to operate bracketball, maintain competition history,
          comply with legal obligations, resolve disputes, and enforce Terms.
        </p>
        <p style={{ marginBottom: 0 }}>
          Retention periods may vary depending on account status, data type, and legal or
          operational requirements.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>7. Your Rights and Choices</h2>
        <p>
          Subject to applicable law, you may request access to, correction of, or deletion of your
          personal information.
        </p>
        <p>
          You can update certain profile settings directly in your account. For broader privacy
          requests, contact us using the email below.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>8. Children&apos;s Privacy</h2>
        <p>
          bracketball is not intended for children under 13, and we do not knowingly collect
          personal information from children under 13.
        </p>
        <p style={{ marginBottom: 0 }}>
          If you believe a child provided personal information, contact us and we will take
          reasonable steps to remove it.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>9. Changes to This Policy</h2>
        <p style={{ marginBottom: 0 }}>
          We may update this Privacy Policy periodically. Continued use of bracketball after updates
          are posted means you accept the revised policy.
        </p>
      </section>

      <section className="legal-doc-section">
        <h2 style={{ marginTop: 0 }}>10. Contact</h2>
        <p>
          For privacy questions or requests, contact{" "}
          <a href="mailto:mack@bracketball.io">mack@bracketball.io</a>.
        </p>
        <p style={{ marginBottom: 0 }}>
          Your use of bracketball is also governed by our <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </main>
  );
}
