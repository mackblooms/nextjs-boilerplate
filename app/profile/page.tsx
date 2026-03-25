"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { withAvatarFallback } from "../../lib/avatar";
import { trackEvent } from "@/lib/analytics";

type ProfileRow = {
  display_name: string | null;
  full_name: string | null;
  favorite_team: string | null;
  avatar_url: string | null;
  bio: string | null;
};

const OPTIONAL_PROFILE_COLUMNS = ["full_name", "favorite_team", "avatar_url", "bio"] as const;

function getMissingProfilesColumn(error: { message?: string; code?: string } | null) {
  if (!error || error.code !== "PGRST204" || !error.message?.includes("profiles")) {
    return null;
  }

  const match = error.message.match(/Could not find the '([^']+)' column/);
  if (!match) return null;

  const column = match[1];
  return OPTIONAL_PROFILE_COLUMNS.includes(column as (typeof OPTIONAL_PROFILE_COLUMNS)[number])
    ? column
    : null;
}

export default function ProfilePage() {
  const router = useRouter();
  const search =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : null;
  const onboarding = search?.get("onboarding") === "1";
  const nextPath = search?.get("next") || "/pools";

  const [fullName, setFullName] = useState("");
  const [favoriteTeam, setFavoriteTeam] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [isEditing, setIsEditing] = useState(onboarding);
  const [userId, setUserId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setUserId(authData.user.id);

      const selectedColumns = [
        "display_name",
        "favorite_team",
        ...OPTIONAL_PROFILE_COLUMNS,
      ] as string[];

      let row: ProfileRow | null = null;

      while (true) {
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select(selectedColumns.join(","))
          .eq("user_id", authData.user.id)
          .maybeSingle();

        if (!profileErr) {
          const selectedRow = (profile as Partial<ProfileRow> | null) ?? null;
          row = selectedRow
            ? {
                display_name: selectedRow.display_name ?? null,
                full_name: selectedRow.full_name ?? null,
                favorite_team: selectedRow.favorite_team ?? null,
                avatar_url: selectedRow.avatar_url ?? null,
                bio: selectedRow.bio ?? null,
              }
            : null;
          break;
        }

        const missingColumn = getMissingProfilesColumn(profileErr);
        if (!missingColumn) {
          setMsg(profileErr.message);
          setLoading(false);
          return;
        }

        const missingIndex = selectedColumns.indexOf(missingColumn);
        if (missingIndex === -1) {
          setMsg(profileErr.message);
          setLoading(false);
          return;
        }

        selectedColumns.splice(missingIndex, 1);
      }

      const resolvedFullName = row?.full_name?.trim() || row?.display_name?.trim() || "";
      const profileExists = Boolean(resolvedFullName) && Boolean(row?.favorite_team?.trim());

      setHasProfile(profileExists);
      setIsEditing(onboarding ? true : !profileExists);

      if (resolvedFullName) setFullName(resolvedFullName);
      if (row?.favorite_team) setFavoriteTeam(row.favorite_team);
      setAvatarUrl(withAvatarFallback(authData.user.id, row?.avatar_url));
      if (row?.bio) setBio(row.bio);

      setLoading(false);
    };

    load();
  }, [onboarding]);

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    setMsg("");

    try {
      if (!file.type.startsWith("image/")) {
        setMsg("Please choose an image file.");
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        setMsg("Please log in first.");
        return;
      }

      const formData = new FormData();
      formData.set("avatar", file);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      const body = (await res.json().catch(() => ({}))) as {
        avatarUrl?: string;
        error?: string;
      };

      if (!res.ok || !body.avatarUrl) {
        setMsg(body.error ?? "Failed to upload avatar.");
        return;
      }

      setAvatarUrl(body.avatarUrl);
      setMsg("Profile picture selected. Click Save to confirm.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function onAvatarFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadAvatar(file);
    e.target.value = "";
  }

  async function save() {
    setMsg("");
    const { data: authData } = await supabase.auth.getUser();
    trackEvent({
      eventName: "profile_save_attempt",
      userId: authData.user?.id ?? null,
      metadata: {
        onboarding,
      },
    });

    if (!authData.user) {
      setMsg("Please log in first.");
      trackEvent({
        eventName: "profile_save_failure",
        metadata: { reason: "not_authenticated", onboarding },
      });
      return;
    }

    const legalName = fullName.trim();
    const team = favoriteTeam.trim();

    if (!legalName || legalName.split(/\s+/).length < 2) {
      setMsg("Please enter your full name (first and last).");
      trackEvent({
        eventName: "profile_save_failure",
        userId: authData.user.id,
        metadata: { reason: "invalid_full_name", onboarding },
      });
      return;
    }

    if (!team) {
      setMsg("Please add your favorite college team.");
      trackEvent({
        eventName: "profile_save_failure",
        userId: authData.user.id,
        metadata: { reason: "missing_favorite_team", onboarding },
      });
      return;
    }

    const payload: Record<string, string | null> = {
      user_id: authData.user.id,
      display_name: legalName,
      full_name: legalName,
      favorite_team: team,
      avatar_url: withAvatarFallback(authData.user.id, avatarUrl),
      bio: bio.trim() || null,
    };

    while (true) {
      const { error } = await supabase.from("profiles").upsert(payload);

      if (!error) {
        break;
      }

      const missingColumn = getMissingProfilesColumn(error);
      if (!missingColumn || !(missingColumn in payload)) {
        setMsg(error.message);
        trackEvent({
          eventName: "profile_save_failure",
          userId: authData.user.id,
          metadata: { reason: error.message, onboarding },
        });
        return;
      }

      delete payload[missingColumn];
    }

    setHasProfile(true);
    trackEvent({
      eventName: "profile_save_success",
      userId: authData.user.id,
      metadata: { onboarding },
    });

    if (onboarding) {
      router.replace(nextPath.startsWith("/") ? nextPath : "/pools");
      return;
    }

    setIsEditing(false);
    setMsg("Saved!");
  }

  const resolvedAvatarUrl = userId
    ? withAvatarFallback(userId, avatarUrl)
    : avatarUrl.trim();

  return (
    <main className="page-shell page-shell--stack page-card" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
        {onboarding ? "Set up your profile" : "Profile"}
      </h1>

      {onboarding ? (
        <p style={{ marginBottom: 16, opacity: 0.9 }}>
          Before you jump in, create your bracketball profile.
        </p>
      ) : null}

      {loading ? <p>Loading...</p> : null}

      {!loading && isEditing ? (
        <>
          <div style={{ display: "grid", placeItems: "center", marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              style={{
                width: 112,
                height: 112,
                borderRadius: 9999,
                border: "1px solid var(--border-color)",
                overflow: "hidden",
                position: "relative",
                padding: 0,
                cursor: "pointer",
                background: "var(--surface-muted)",
              }}
            >
              {resolvedAvatarUrl ? (
                <img
                  src={resolvedAvatarUrl}
                  alt={fullName || "Profile"}
                  width={112}
                  height={112}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                    fontSize: 30,
                  }}
                >
                  {(fullName || "P").slice(0, 1).toUpperCase()}
                </div>
              )}
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(0,0,0,0.42)",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 14,
                }}
              >
                {uploadingAvatar ? "Uploading..." : "Edit"}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onAvatarFileChange}
              style={{ display: "none" }}
            />
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Tap the profile circle to upload from this device.
            </p>
            <button
              type="button"
              onClick={() => {
                if (!userId) return;
                setAvatarUrl(withAvatarFallback(userId, null));
              }}
              style={{
                marginTop: 4,
                fontSize: 12,
                border: "1px solid var(--border-color)",
                borderRadius: 999,
                background: "transparent",
                padding: "4px 10px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Use random avatar
            </button>
          </div>

          <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>
            Full name (first + last, required)
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
              disabled={uploadingAvatar}
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                fontWeight: 800,
                opacity: uploadingAvatar ? 0.65 : 1,
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
            {resolvedAvatarUrl ? (
              <img
                src={resolvedAvatarUrl}
                alt={fullName || "Profile"}
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
                {(fullName || "P").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 900, fontSize: 22 }}>
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
