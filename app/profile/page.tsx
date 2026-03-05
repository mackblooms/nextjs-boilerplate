"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  display_name: string | null;
  favorite_team: string | null;
  avatar_url: string | null;
  bio: string | null;
};

function isMissingAvatarColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false;

  return (
    error.code === "PGRST204" &&
    error.message?.includes("avatar_url") &&
    error.message?.includes("profiles")
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const search =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const onboarding = search?.get("onboarding") === "1";
  const nextPath = search?.get("next") || "/pools";

  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [favoriteTeam, setFavoriteTeam] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(onboarding);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg("");

      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        setMsg("Please log in first.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("display_name,favorite_team,avatar_url,bio")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      let row = (profile as ProfileRow | null) ?? null;

      if (profileErr) {
        if (!isMissingAvatarColumnError(profileErr)) {
          setMsg(profileErr.message);
          setLoading(false);
          return;
        }

        const { data: profileWithoutAvatar, error: fallbackErr } = await supabase
          .from("profiles")
          .select("display_name,favorite_team,bio")
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (fallbackErr) {
          setMsg(fallbackErr.message);
          setLoading(false);
          return;
        }

        row = profileWithoutAvatar
          ? {
              ...(profileWithoutAvatar as Omit<ProfileRow, "avatar_url">),
              avatar_url: null,
            }
          : null;
      }

      const profileExists =
        Boolean(row?.display_name) ||
        Boolean(row?.favorite_team) ||
        Boolean(row?.avatar_url) ||
        Boolean(row?.bio);

      setHasProfile(profileExists);
      setIsEditing(onboarding ? true : !profileExists);

      if (row?.display_name) setDisplayName(row.display_name);
      if (row?.display_name) setFullName(row.display_name);
      if (row?.favorite_team) setFavoriteTeam(row.favorite_team);
      if (row?.avatar_url) setAvatarUrl(row.avatar_url);
      if (row?.bio) setBio(row.bio);

      setLoading(false);
    };

    load();
  }, [onboarding]);

  async function save() {
    setMsg("");
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setMsg("Please log in first.");
      return;
    }

    const bracketName = displayName.trim();
    const legalName = fullName.trim();
    const team = favoriteTeam.trim();

    if (!bracketName) {
      setMsg("Please enter a bracket nickname.");
      return;
    }

    if (!legalName || legalName.split(/\s+/).length < 2) {
      setMsg("Please enter your full name (first and last).");
      return;
    }

    if (!team) {
      setMsg("Please add your favorite college team.");
      return;
    }

    const payload = {
      user_id: authData.user.id,
      display_name: legalName,
      favorite_team: team,
      avatar_url: avatarUrl.trim() || null,
      bio: bio.trim() || null,
    };

    const { error } = await supabase.from("profiles").upsert(payload);

    if (error) {
      if (!isMissingAvatarColumnError(error)) {
        setMsg(error.message);
        return;
      }

      const payloadWithoutAvatar = {
        user_id: payload.user_id,
        display_name: payload.display_name,
        favorite_team: payload.favorite_team,
        bio: payload.bio,
      };
      const { error: fallbackErr } = await supabase
        .from("profiles")
        .upsert(payloadWithoutAvatar);

      if (fallbackErr) {
        setMsg(fallbackErr.message);
        return;
      }
    }

    setHasProfile(true);

    if (onboarding) {
      router.replace(nextPath.startsWith("/") ? nextPath : "/pools");
      return;
    }

    setIsEditing(false);
    setMsg("Saved!");
  }

  return (
    <main style={{ maxWidth: 560, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
        {onboarding ? "Set up your profile" : "Profile"}
      </h1>

      {onboarding ? (
        <p style={{ marginBottom: 16, opacity: 0.9 }}>
          Before you jump in, create your bracketball profile.
        </p>
      ) : null}

      {loading ? <p>Loading…</p> : null}

      {!loading && isEditing ? (
        <>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>
            Bracket nickname
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., CinderellaHunter"
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #ccc",
              borderRadius: 8,
              marginBottom: 12,
            }}
          />

          <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>
            Full name (first + last)
          </label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g., Jordan Matthews"
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #ccc",
              borderRadius: 8,
              marginBottom: 12,
            }}
          />

          <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>
            Favorite college team
          </label>
          <input
            value={favoriteTeam}
            onChange={(e) => setFavoriteTeam(e.target.value)}
            placeholder="e.g., UConn"
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #ccc",
              borderRadius: 8,
              marginBottom: 12,
            }}
          />

          <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>
            Profile picture URL
          </label>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://..."
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #ccc",
              borderRadius: 8,
              marginBottom: 12,
            }}
          />

          <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>
            Bio (optional)
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell your poolmates about your upset philosophy"
            rows={3}
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #ccc",
              borderRadius: 8,
              marginBottom: 12,
              resize: "vertical",
            }}
          />

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={save}
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              {onboarding ? "Save and continue" : "Save"}
            </button>

            {hasProfile && !onboarding ? (
              <button
                onClick={() => {
                  setIsEditing(false);
                  setMsg("");
                }}
                style={{
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                  cursor: "pointer",
                  fontWeight: 700,
                  background: "transparent",
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {!loading && !isEditing ? (
        <section
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: 14,
            background: "var(--surface)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName || displayName || "Profile"}
                width={72}
                height={72}
                style={{
                  borderRadius: 999,
                  objectFit: "cover",
                  border: "1px solid var(--border-color)",
                }}
              />
            ) : (
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 999,
                  border: "1px solid var(--border-color)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 900,
                  fontSize: 24,
                  background: "var(--surface-muted)",
                }}
              >
                {(fullName || displayName || "P").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 900, fontSize: 22 }}>
                {displayName || "Bracket nickname"}
              </div>
              <div style={{ opacity: 0.75, fontWeight: 700 }}>
                {fullName || "Full name"}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <b>Favorite team:</b> {favoriteTeam || "Not set"}
            </div>
            <div>
              <b>Bio:</b> {bio || "No bio yet."}
            </div>
          </div>

          <button
            onClick={() => {
              setIsEditing(true);
              setMsg("");
            }}
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-color)",
              cursor: "pointer",
              fontWeight: 800,
              background: "transparent",
            }}
          >
            Edit profile
          </button>
        </section>
      ) : null}

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
    </main>
  );
}
