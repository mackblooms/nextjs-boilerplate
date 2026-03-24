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
      <p style={{ marginTop: 8, opacity: 0.8 }}>Effective Date: March 24, 2026</p>
      <p style={{ marginTop: 18 }}>
        Welcome to bracketball. By accessing or using the platform, you agree to these Terms of
        Service.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>1. Use of the Platform</h2>
        <p>
          bracketball provides a sports-related draft and bracket competition platform. You agree to
          use bracketball only for lawful purposes and in accordance with these Terms.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>2. Eligibility</h2>
        <p style={{ marginBottom: 0 }}>
          You must be at least 13 years old to use bracketball. By using the platform, you confirm
          that you meet this requirement.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>3. Accounts</h2>
        <p>
          You may need to create an account to use some features. You are responsible for
          maintaining the confidentiality of your credentials and for activity under your account.
        </p>
        <p style={{ marginBottom: 0 }}>
          You agree to provide accurate account information and keep it updated.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>4. Acceptable Use</h2>
        <p>You agree not to misuse the platform, including attempts to:</p>
        <ul style={{ marginBottom: 0 }}>
          <li>use the platform for unlawful activity,</li>
          <li>interfere with or disrupt service operation,</li>
          <li>gain unauthorized access to accounts, data, or systems,</li>
          <li>use bots, scripts, or automation to manipulate gameplay or results.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>5. Game Rules and Scoring</h2>
        <p>
          bracketball gameplay, scoring, and contest structure are described on the{" "}
          <Link href="/how-it-works">How It Works</Link> page (the &quot;Rules Page&quot;).
          By participating in contests, you agree to those rules.
        </p>
        <p>Current scoring mechanics include, among other things:</p>
        <ul>
          <li>a 100-point draft budget with seed-based team costs and draft caps,</li>
          <li>round-based base points (R64, R32, S16, E8, F4, Championship),</li>
          <li>seed multiplier scoring, upset bonus, and historic upset bonuses,</li>
          <li>Perfect Round of 64 bonus when all drafted teams win in R64.</li>
        </ul>
        <p>
          bracketball may modify rules, scoring formulas, point values, bonuses, tie-breakers, or
          contest mechanics at any time. Continued use constitutes acceptance of those updates.
        </p>
        <p>
          Scores, standings, and results shown on the platform are final once posted, unless
          bracketball determines a correction is needed. bracketball may correct scoring, standings,
          or results at any time to address platform or data issues.
        </p>
        <p>
          bracketball relies on third-party game data feeds and is not responsible for delays,
          errors, or inaccuracies in underlying schedules, results, statistics, or status updates.
        </p>
        <p style={{ marginBottom: 0 }}>
          In any scoring or outcome dispute, bracketball&apos;s determination is final and binding.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>6. Competition Integrity</h2>
        <p>
          bracketball may investigate activity that may compromise fair competition, including
          suspicious behavior or exploitation of platform mechanics.
        </p>
        <p style={{ marginBottom: 0 }}>
          To preserve contest integrity, bracketball may take corrective action, including score
          adjustments, result updates, feature restrictions, suspension, or account removal.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>7. Intellectual Property and No Affiliation</h2>
        <p>
          bracketball is independent and is not affiliated with, endorsed by, or sponsored by the
          NCAA or any college or university.
        </p>
        <p style={{ marginBottom: 0 }}>
          Team names, logos, trademarks, and other third-party intellectual property remain the
          property of their respective owners and are used only for identification purposes.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>8. Platform Availability</h2>
        <p>
          bracketball is provided for entertainment on an &quot;as is&quot; and &quot;as
          available&quot; basis. We do not guarantee uninterrupted or error-free operation.
        </p>
        <p style={{ marginBottom: 0 }}>
          We may modify, suspend, or discontinue features at any time.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>9. Competitions and Liability Limits</h2>
        <p>
          Competitions, rankings, and standings on bracketball are for recreational purposes unless
          explicitly stated otherwise.
        </p>
        <p>
          To the fullest extent permitted by law, bracketball is not liable for indirect,
          incidental, special, consequential, or punitive damages, including loss of ranking,
          perceived competitive disadvantage, or missed opportunities.
        </p>
        <p style={{ marginBottom: 0 }}>
          Some jurisdictions do not allow certain limitations, so parts of this section may not
          apply to you.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>10. Changes to These Terms</h2>
        <p>
          We may revise these Terms from time to time. Continued use after updates are posted means
          you accept the revised Terms.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>11. Contact</h2>
        <p>
          If you have questions about these Terms, contact{" "}
          <a href="mailto:mack@bracketball.io">mack@bracketball.io</a>.
        </p>
        <p style={{ marginBottom: 0 }}>
          For privacy details, see our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  );
}

