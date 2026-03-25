"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { trackEvent } from "@/lib/analytics";

export default function NewPoolPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function createPool(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setSaving(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setMsg("Please log in first.");
      trackEvent({
        eventName: "pool_create_failure",
        metadata: { reason: "not_authenticated" },
      });
      setSaving(false);
      return;
    }

    const poolName = name.trim();
    const poolPassword = password.trim();
    const confirmation = confirmPassword.trim();
    trackEvent({
      eventName: "pool_create_attempt",
      metadata: {
        has_pool_name: Boolean(poolName),
        password_length: poolPassword.length,
      },
    });

    if (!poolName) {
      setMsg("Enter a pool name.");
      trackEvent({
        eventName: "pool_create_failure",
        metadata: { reason: "missing_pool_name" },
      });
      setSaving(false);
      return;
    }

    if (poolPassword.length < 4) {
      setMsg("Enter a pool password with at least 4 characters.");
      trackEvent({
        eventName: "pool_create_failure",
        metadata: { reason: "short_password" },
      });
      setSaving(false);
      return;
    }

    if (poolPassword !== confirmation) {
      setMsg("Pool passwords do not match.");
      trackEvent({
        eventName: "pool_create_failure",
        metadata: { reason: "password_mismatch" },
      });
      setSaving(false);
      return;
    }

    const res = await fetch("/api/pools/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name: poolName,
        password: poolPassword,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      poolId?: string;
      error?: string;
    };

    if (!res.ok || !body.poolId) {
      setMsg(body.error ?? "Failed to create pool.");
      trackEvent({
        eventName: "pool_create_failure",
        metadata: { reason: body.error ?? "api_error" },
      });
      setSaving(false);
      return;
    }

    trackEvent({
      eventName: "pool_create_success",
      poolId: body.poolId,
    });

    router.push(`/pool/${body.poolId}`);
  }

  return (
    <main className="page-shell page-shell--stack page-card" style={{ maxWidth: 520 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
        Create a Pool
      </h1>

      <form onSubmit={createPool}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., bracketball - Friends 2026"
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            marginBottom: 12,
            background: "var(--surface-muted)",
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Pool password (required)"
          minLength={4}
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            marginBottom: 12,
            background: "var(--surface-muted)",
          }}
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm pool password"
          minLength={4}
          style={{
            width: "100%",
            padding: "12px 14px",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            marginBottom: 12,
            background: "var(--surface-muted)",
          }}
        />
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--surface-elevated)",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          {saving ? "Creating..." : "Create pool"}
        </button>
      </form>

      <p style={{ marginTop: 12, opacity: 0.75, fontSize: 13 }}>
        New pools are private by default and require this password to join.
      </p>

      {msg ? <p style={{ marginTop: 12 }}>{msg}</p> : null}
    </main>
  );
}
