"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { withAvatarFallback } from "../../lib/avatar";
import { trackEvent } from "@/lib/analytics";
import {
  getPushInstallationId,
  normalizePushPermissionState,
  type PushPermissionState,
} from "@/lib/pushNotifications";

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
  const nextPath = search?.get("next") || "/";

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
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [pushSupported] = useState(Capacitor.isNativePlatform());
  const [pushLoading, setPushLoading] = useState(Capacitor.isNativePlatform());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<PushPermissionState>("unknown");
  const [pushMessage, setPushMessage] = useState("");
  const [pushInstallationId, setPushInstallationId] = useState("");
  const [isSiteAdmin, setIsSiteAdmin] = useState(false);
  const [sendingTestPush, setSendingTestPush] = useState(false);
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

  useEffect(() => {
    if (!pushSupported || !userId) {
      setPushLoading(false);
      return;
    }

    let isMounted = true;

    const loadPushState = async () => {
      setPushLoading(true);

      try {
        const permission = await PushNotifications.checkPermissions();
        if (!isMounted) return;

        const nextPermission = normalizePushPermissionState(permission.receive);
        setPushPermission(nextPermission);

        const installationId = getPushInstallationId();
        setPushInstallationId(installationId);

        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) {
          if (!isMounted) return;
          setPushEnabled(false);
          setPushLoading(false);
          return;
        }

        const res = await fetch(
          `/api/push/device?installationId=${encodeURIComponent(installationId)}`,
          {
            headers: {
              authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
          },
        );

        const body = (await res.json().catch(() => ({}))) as {
          device?: {
            enabled?: boolean;
            permissionState?: string | null;
          } | null;
        };

        if (!isMounted) return;

        if (res.ok && body.device) {
          setPushEnabled(body.device.enabled !== false && nextPermission === "granted");
          setPushPermission(normalizePushPermissionState(body.device.permissionState));
        } else {
          setPushEnabled(false);
        }
      } catch {
        if (!isMounted) return;
        setPushEnabled(false);
        setPushPermission("unknown");
      } finally {
        if (isMounted) setPushLoading(false);
      }
    };

    void loadPushState();

    return () => {
      isMounted = false;
    };
  }, [pushSupported, userId]);

  useEffect(() => {
    if (!userId) return;

    let isMounted = true;

    const loadAdminStatus = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) return;

      const res = await fetch("/api/admin/me", {
        headers: {
          authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      if (!isMounted) return;
      setIsSiteAdmin(res.ok);
    };

    void loadAdminStatus();

    return () => {
      isMounted = false;
    };
  }, [userId]);

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

  function dataUrlToFile(dataUrl: string, filename: string) {
    const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!match) return null;

    const mimeType = match[1];
    const base64 = match[2];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new File([bytes], filename, { type: mimeType });
  }

  async function pickNativeAvatar(source: CameraSource) {
    setAvatarPickerOpen(false);

    try {
      const photo = await Camera.getPhoto({
        quality: 88,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source,
        width: 1200,
        height: 1200,
      });

      if (!photo.dataUrl) {
        setMsg("No photo selected.");
        return;
      }

      const extension = photo.format === "png" ? "png" : photo.format === "gif" ? "gif" : "jpg";
      const file = dataUrlToFile(photo.dataUrl, `avatar.${extension}`);
      if (!file) {
        setMsg("Couldn't read that photo. Try another one.");
        return;
      }

      await uploadAvatar(file);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (/cancel/i.test(message)) return;
      setMsg("Couldn't open your camera or photo library.");
    }
  }

  function openAvatarPicker() {
    if (uploadingAvatar) return;
    if (Capacitor.isNativePlatform()) {
      setAvatarPickerOpen(true);
      return;
    }
    fileInputRef.current?.click();
  }

  async function enablePushNotifications() {
    setPushBusy(true);
    setPushMessage("");

    try {
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === "prompt") {
        permission = await PushNotifications.requestPermissions();
      }

      const permissionState = normalizePushPermissionState(permission.receive);
      setPushPermission(permissionState);

      if (permissionState !== "granted") {
        setPushEnabled(false);
        setPushMessage("Notifications are off for this phone right now.");
        return;
      }

      await PushNotifications.register();
      setPushEnabled(true);
      setPushMessage("Push notifications are enabled on this phone.");
    } catch {
      setPushEnabled(false);
      setPushMessage("Couldn't enable notifications on this phone.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushNotifications() {
    setPushBusy(true);
    setPushMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (session) {
        await fetch("/api/push/device", {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            installationId: getPushInstallationId(),
          }),
        });
      }

      await PushNotifications.unregister().catch(() => {});
      const permission = await PushNotifications.checkPermissions().catch(() => ({ receive: "unknown" as const }));
      setPushPermission(normalizePushPermissionState(permission.receive));
      setPushEnabled(false);
      setPushMessage("Push notifications are turned off for this phone.");
    } catch {
      setPushMessage("Couldn't turn off notifications right now.");
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    setSendingTestPush(true);
    setPushMessage("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        setPushMessage("Please log in again before sending a test push.");
        return;
      }

      const res = await fetch("/api/admin/push/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          installationId: pushInstallationId || undefined,
          path: "/profile",
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        environment?: string;
      };

      if (!res.ok) {
        setPushMessage(body.error ?? "Couldn't send a test push.");
        return;
      }

      setPushMessage(
        `Test push sent through APNs ${body.environment ? `(${body.environment})` : ""}.`,
      );
    } finally {
      setSendingTestPush(false);
    }
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
      router.replace(nextPath.startsWith("/") ? nextPath : "/");
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
              onClick={openAvatarPicker}
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
              capture="environment"
              onChange={onAvatarFileChange}
              style={{ display: "none" }}
            />
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              {Capacitor.isNativePlatform()
                ? "Tap the profile circle to choose a photo or take one."
                : "Tap the profile circle to upload from this device."}
            </p>
            {avatarPickerOpen ? (
              <div
                role="presentation"
                onClick={() => setAvatarPickerOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(8, 15, 25, 0.42)",
                  zIndex: 1190,
                }}
              />
            ) : null}
            {avatarPickerOpen ? (
              <section
                style={{
                  position: "fixed",
                  left: 16,
                  right: 16,
                  bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
                  zIndex: 1200,
                  border: "1px solid var(--border-color)",
                  borderRadius: 18,
                  background: "var(--surface-glass)",
                  boxShadow: "var(--shadow-lg)",
                  padding: 12,
                  display: "grid",
                  gap: 8,
                  backdropFilter: "saturate(130%) blur(12px)",
                }}
              >
                <button
                  type="button"
                  className="ui-btn ui-btn--lg ui-btn--primary ui-btn--full"
                  onClick={() => void pickNativeAvatar(CameraSource.Photos)}
                >
                  Choose from library
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--lg ui-btn--secondary ui-btn--full"
                  onClick={() => void pickNativeAvatar(CameraSource.Camera)}
                >
                  Take photo
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--lg ui-btn--ghost ui-btn--full"
                  onClick={() => {
                    setAvatarPickerOpen(false);
                    fileInputRef.current?.click();
                  }}
                >
                  Browse files
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--lg ui-btn--ghost ui-btn--full"
                  onClick={() => setAvatarPickerOpen(false)}
                >
                  Cancel
                </button>
              </section>
            ) : null}
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

      {!loading && !onboarding && pushSupported ? (
        <section
          style={{
            border: "1px solid var(--border-color)",
            borderRadius: 12,
            padding: 14,
            background: "var(--surface)",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Push notifications</h2>
            <p style={{ margin: 0, opacity: 0.78 }}>
              Get pool updates on this phone when scores move and activity picks up.
            </p>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 800,
              opacity: 0.84,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: pushEnabled ? "#16a34a" : "rgba(148, 163, 184, 0.9)",
              }}
            />
            {pushLoading
              ? "Checking this device..."
              : pushEnabled
                ? "Enabled on this phone"
                : pushPermission === "denied"
                  ? "Denied in device settings"
                  : "Not enabled on this phone"}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void enablePushNotifications()}
              disabled={pushBusy || pushLoading || pushEnabled}
              className="ui-btn ui-btn--primary"
            >
              {pushBusy && !pushEnabled ? "Enabling..." : pushEnabled ? "Enabled" : "Enable notifications"}
            </button>
            <button
              type="button"
              onClick={() => void disablePushNotifications()}
              disabled={pushBusy || pushLoading || !pushEnabled}
              className="ui-btn ui-btn--secondary"
            >
              {pushBusy && pushEnabled ? "Turning off..." : "Turn off on this phone"}
            </button>
            {isSiteAdmin ? (
              <button
                type="button"
                onClick={() => void sendTestPush()}
                disabled={sendingTestPush || pushLoading || !pushEnabled}
                className="ui-btn ui-btn--ghost"
              >
                {sendingTestPush ? "Sending test..." : "Send test push"}
              </button>
            ) : null}
          </div>

          <p style={{ margin: 0, fontSize: 12, opacity: 0.72 }}>
            If you deny notifications on iPhone, you can turn them back on later in Settings.
          </p>
          {pushMessage ? <p style={{ margin: 0 }}>{pushMessage}</p> : null}
        </section>
      ) : null}

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
    </main>
  );
}
