export type ProfileCompletionRow = {
  display_name: string | null;
  full_name: string | null;
  favorite_team: string | null;
};

export const PROFILE_COMPLETION_COLUMNS = ["display_name", "full_name", "favorite_team"] as const;

export function isProfileComplete(profile: ProfileCompletionRow | null) {
  const resolvedFullName = profile?.full_name?.trim() || profile?.display_name?.trim() || "";
  return Boolean(resolvedFullName) && Boolean(profile?.favorite_team?.trim());
}

