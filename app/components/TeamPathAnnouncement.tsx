"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getStoredActivePoolId } from "@/lib/activePool";

const TEAM_PATH_ANNOUNCEMENT_HIDE_KEY = "bracketball.worldCupTeamPathAnnouncement.hidden.v1";
const TEAM_PATH_ANNOUNCEMENT_EXPIRES_AT = Date.parse("2026-07-10T05:00:00.000Z");

function poolIdFromPath(pathname: string | null) {
  const match = pathname?.match(/^\/pool\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export default function TeamPathAnnouncement() {
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [hideMovingForward, setHideMovingForward] = useState(false);

  const bracketTarget = useMemo(() => {
    const poolId = poolIdFromPath(pathname) ?? getStoredActivePoolId();
    return poolId ? `/pool/${encodeURIComponent(poolId)}/bracket` : "/pools";
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (Date.now() > TEAM_PATH_ANNOUNCEMENT_EXPIRES_AT) return undefined;
    if (window.localStorage.getItem(TEAM_PATH_ANNOUNCEMENT_HIDE_KEY) === "1") return undefined;
    const timer = window.setTimeout(() => setShow(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const dismiss = useCallback(() => {
    if (hideMovingForward && typeof window !== "undefined") {
      window.localStorage.setItem(TEAM_PATH_ANNOUNCEMENT_HIDE_KEY, "1");
    }
    setShow(false);
  }, [hideMovingForward]);

  const goToBracket = useCallback(() => {
    dismiss();
    router.push(bracketTarget);
  }, [bracketTarget, dismiss, router]);

  if (!show) return null;

  return (
    <div
      role="presentation"
      className="world-cup-team-path-overlay"
      onClick={dismiss}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Team path forecast announcement"
        className="world-cup-team-path-modal world-cup-team-path-modal--announcement"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="world-cup-team-path-hero">
          <span className="world-cup-team-path-announcement-icon" aria-hidden="true">
            path
          </span>
          <div className="world-cup-team-path-title">
            <span>new in bracket</span>
            <strong>Explore each team&apos;s path forecast</strong>
          </div>
          <button
            type="button"
            className="world-cup-team-path-close"
            onClick={dismiss}
            aria-label="Close team path forecast announcement"
          >
            x
          </button>
        </div>

        <div className="world-cup-team-path-announcement-copy">
          <p>
            Tap any team name or flag in the World Cup bracket or group tables to open its outlook.
          </p>
          <p>
            The path forecast shows price, points earned so far, next matchup, what a win would add,
            and the maximum points still available if the run keeps going.
          </p>
        </div>

        <div className="world-cup-team-path-announcement-grid">
          <div>
            <span>1</span>
            <strong>Pick a team</strong>
            <small>Any real team in the bracket or group stage is clickable.</small>
          </div>
          <div>
            <span>2</span>
            <strong>Check the next swing</strong>
            <small>See the upcoming opponent and points available with a win.</small>
          </div>
          <div>
            <span>3</span>
            <strong>Follow the route</strong>
            <small>Scan the remaining rounds and the upside left in that team.</small>
          </div>
        </div>

        <label className="world-cup-team-path-announcement-check">
          <input
            type="checkbox"
            checked={hideMovingForward}
            onChange={(event) => setHideMovingForward(event.target.checked)}
          />
          <span>Don&apos;t show this again</span>
        </label>

        <div className="world-cup-team-path-announcement-actions">
          <button type="button" className="ui-btn ui-btn--md" onClick={dismiss}>
            Got it
          </button>
          <button type="button" className="ui-btn ui-btn--md ui-btn--primary" onClick={goToBracket}>
            Take me to bracket
          </button>
        </div>
      </section>
    </div>
  );
}
