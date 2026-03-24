import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import HomeButton from "./components/HomeButton";
import AppTopNav from "./components/AppTopNav";
import InstructionsModal from "./components/InstructionsModal";
import "./globals.css";

export const metadata: Metadata = {
  title: "bracketball",
  description: "bracketball pool for March Madness",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <HomeButton />
        <AppTopNav />
        <Suspense fallback={null}>
          <InstructionsModal />
        </Suspense>

        <main className="site-main">{children}</main>
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
