import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
                <Link
          href="/"
          aria-label="Go to bracketball home"
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 1000,
            background: "#111",
            color: "#fff",
            borderRadius: 999,
            padding: "8px 14px",
            fontWeight: 800,
            textDecoration: "none",
            lineHeight: 1,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          bracketball
        </Link>

        {children}
      </body>
    </html>
  );
}
