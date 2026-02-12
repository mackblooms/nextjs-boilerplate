"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function NewPoolPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function createPool(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setSaving(true);

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setMsg("Please log in first.");
      setSaving(false);
      return;
    }

    const poolName = name.trim();
    if (!poolName) {
      setMsg("Enter a pool name.");
      setSaving(false);
      return;
    }

    // 1) create pool
    const { data: pool, error: poolErr } = await supabase
      .from("pools")
      .insert({ name: poolName, created_by: user.id })
      .select("id")
      .single();

    if (poolErr || !pool) {
      setMsg(poolErr?.message ?? "Failed to create pool.");
      setSaving(false);
      return;
    }

    // 2) auto-join creator
    const { error: joinErr } = await supabase.from("pool_members").insert({
      pool_id: pool.id,
      user_id: user.id,
    });

    if (joinErr) {
      setMsg(joinErr.message);
      setSaving(false);
      return;
    }

    // 3) redirect to pool page
    router.push(`/pool/${pool.id}`);
  }

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
        Create a Pool
      </h1>

      <form onSubmit={createPool}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., BracketBall — Friends 2026"
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid #ccc",
            borderRadius: 8,
            marginBottom: 12,
          }}
        />
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          {saving ? "Creating…" : "Create pool"}
        </button>
      </form>

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
    </main>
  );
}
