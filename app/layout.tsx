import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import HomeButton from "./components/HomeButton";
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
        <HomeButton />

        {children}
      </body>
    </html>
  );
}
