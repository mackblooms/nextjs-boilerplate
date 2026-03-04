"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type ProfileRow = {
  display_name: string | null;
  full_name: string | null;
  favorite_team: string | null;
  avatar_url: string | null;
  bio: string | null;
};

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

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name,full_name,favorite_team,avatar_url,bio")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      const row = (profile as ProfileRow | null) ?? null;
      if (row?.display_name) setDisplayName(row.display_name);
      if (row?.full_name) setFullName(row.full_name);
      if (row?.favorite_team) setFavoriteTeam(row.favorite_team);
      if (row?.avatar_url) setAvatarUrl(row.avatar_url);
      if (row?.bio) setBio(row.bio);

      setLoading(false);
    };

    load();
  }, []);

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

    const { error } = await supabase.from("profiles").upsert({
      user_id: authData.user.id,
      display_name: bracketName,
      full_name: legalName,
      favorite_team: team,
      avatar_url: avatarUrl.trim() || null,
      bio: bio.trim() || null,
    });

    if (error) {
      setMsg(error.message);
      return;
    }

    if (onboarding) {
      router.replace(nextPath.startsWith("/") ? nextPath : "/pools");
      return;
    }

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

      {loading ? (
        <p>Loading…</p>
      ) : (
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

          {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
        </>
      )}
    </main>
  );
}
