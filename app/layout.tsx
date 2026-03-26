import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";
import { IBM_Plex_Mono, Manrope, Space_Grotesk } from "next/font/google";
import HomeButton from "./components/HomeButton";
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
        <HomeButton />
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
          </nav>
        </footer>
      </body>
    </html>
  );
}
