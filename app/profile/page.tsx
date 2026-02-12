"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState("");
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
        .select("display_name")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (profile?.display_name) setDisplayName(profile.display_name);
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

    const name = displayName.trim();
    if (!name) {
      setMsg("Please enter a display name.");
      return;
    }

    const { error } = await supabase.from("profiles").upsert({
      user_id: authData.user.id,
      display_name: name,
    });

    setMsg(error ? error.message : "Saved!");
  }

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
        Profile
      </h1>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>
            Display name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g., Mack"
            style={{
              width: "100%",
              padding: "12px 14px",
              border: "1px solid #ccc",
              borderRadius: 8,
              marginBottom: 12,
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
            Save
          </button>

          {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
        </>
      )}
    </main>
  );
}
