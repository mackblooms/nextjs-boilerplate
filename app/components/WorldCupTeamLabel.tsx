import type { CSSProperties } from "react";
import { toSchoolDisplayName } from "@/lib/teamNames";
import { worldCupLogoUrl } from "@/lib/worldCupLogos";

type WorldCupTeamLabelProps = {
  name: string | null | undefined;
  logoUrl?: string | null;
  fallback?: string;
  className?: string;
  style?: CSSProperties;
  nameStyle?: CSSProperties;
};

export function WorldCupLogoChip({
  name,
  logoUrl,
}: {
  name?: string | null;
  logoUrl?: string | null;
}) {
  const resolvedLogoUrl = worldCupLogoUrl(name, logoUrl);
  return (
    <span className="world-cup-team-logo" data-empty={resolvedLogoUrl ? undefined : "true"}>
      {resolvedLogoUrl ? <img src={resolvedLogoUrl} alt="" loading="lazy" /> : null}
    </span>
  );
}

export default function WorldCupTeamLabel({
  name,
  logoUrl,
  fallback = "Unknown",
  className,
  style,
  nameStyle,
}: WorldCupTeamLabelProps) {
  const displayName = toSchoolDisplayName(name) || fallback;
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
        ...style,
      }}
    >
      <WorldCupLogoChip name={name} logoUrl={logoUrl} />
      <span className="world-cup-team-name" style={nameStyle}>
        {displayName}
      </span>
    </span>
  );
}
