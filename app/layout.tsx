import type { Metadata } from "next";
import HomeButton from "./components/HomeButton";
import AppTopNav from "./components/AppTopNav";
import ThemeSwitch from "./components/ThemeSwitch";
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
        <ThemeSwitch />
        <AppTopNav />

        {children}
      </body>
    </html>
  );
}
