import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";
import { IBM_Plex_Mono, Manrope, Space_Grotesk } from "next/font/google";
import AppDeepLinkHandler from "./components/AppDeepLinkHandler";
import AppLaunchIntro from "./components/AppLaunchIntro";
import AppPushNotifications from "./components/AppPushNotifications";
import AppTopNav from "./components/AppTopNav";
import InstructionsModal from "./components/InstructionsModal";
import HowItWorksRulesModal from "./components/HowItWorksRulesModal";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-app-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-app-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-brand-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "bracketball",
  description: "bracketball pool for march madness",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1220" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${ibmPlexMono.variable} ${spaceGrotesk.variable} antialiased`}
      >
        <AppLaunchIntro />
        <AppDeepLinkHandler />
        <AppPushNotifications />
        <div className="app-launch-content">
          <AppTopNav />
          <Suspense fallback={null}>
            <InstructionsModal />
          </Suspense>
          <HowItWorksRulesModal />

          <main className="site-main">{children}</main>
          <Analytics />
          <footer className="site-disclaimer" role="contentinfo">
            bracketball is an independent, unofficial platform and is not
            affiliated with, endorsed by, or sponsored by the NCAA or any
            college or university. All team names, trademarks, and other
            intellectual property are the property of their respective owners and
            are used solely for identification purposes.
            <nav aria-label="Legal links" className="site-disclaimer-links">
              <Link href="/terms">Terms of Service</Link>
              <span aria-hidden="true">|</span>
              <Link href="/privacy">Privacy Policy</Link>
              <span aria-hidden="true">|</span>
              <Link href="/support">Support</Link>
            </nav>
          </footer>
        </div>
      </body>
    </html>
  );
}
