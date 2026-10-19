"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./season.module.css";

export default function SeasonNavigation() {
  const path = usePathname();
  return <nav className={styles.seasonNav} aria-label="College basketball season">
    <Link href="/college-basketball" aria-current={path === "/college-basketball" ? "page" : undefined}>Squad builder</Link>
    <Link href="/college-basketball/standings" aria-current={path.startsWith("/college-basketball/standings") ? "page" : undefined}>Season standings <span>preview</span></Link>
  </nav>;
}
