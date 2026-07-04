"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { trackEvent } from "@/lib/analytics";
import { UiButton, UiFormField, UiInput, UiStatus } from "../../components/ui/primitives";
import { competitionPath, getCompetition, normalizeCompetitionSlug } from "@/lib/competitions";
import { draftLibraryLockMessage, isDraftLibraryLocked } from "@/lib/draftLock";

function NewPoolPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const competitionSlug = normalizeCompetitionSlug(searchParams.get("competition"));
  const competition = getCompetition(competitionSlug);
  const poolsLocked = isDraftLibraryLocked(competitionSlug);
  const poolsLockedMessage = draftLibraryLockMessage(competitionSlug);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function createPool(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");

    if (poolsLocked) {
      setMsg(poolsLockedMessage);
      trackEvent({
        eventName: "pool_create_failure",
        metadata: { reason: "draft_locked" },
      });
      return;
    }

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
        competitionSlug,
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

    router.push(competitionPath(`/pool/${body.poolId}/draft`, competitionSlug));
  }

  return (
    <main className="page-shell page-card app-form-card" style={{ maxWidth: 520 }}>
      <h1>
        Create a {competition.shortName} Pool
      </h1>

      <form onSubmit={createPool} className="app-form">
        <UiFormField
          label="pool name"
          htmlFor="pool-name"
          required
          helperText="choose a name your group will recognize."
          error={name.trim().length === 0 && msg === "Enter a pool name." ? msg : undefined}
        >
          <UiInput
            id="pool-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={poolsLocked || saving}
            placeholder="bracketball friends 2026"
            aria-invalid={name.trim().length === 0 && msg === "Enter a pool name."}
          />
        </UiFormField>

        <UiFormField
          label="pool password"
          htmlFor="pool-password"
          required
          helperText="members need this password to join."
          error={password.trim().length > 0 && password.trim().length < 4 ? "use at least 4 characters." : undefined}
        >
          <UiInput
            id="pool-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={poolsLocked || saving}
            placeholder="pool password"
            minLength={4}
            aria-invalid={password.trim().length > 0 && password.trim().length < 4}
          />
        </UiFormField>

        <UiFormField
          label="confirm password"
          htmlFor="pool-confirm-password"
          required
          error={confirmPassword && password !== confirmPassword ? "passwords do not match." : undefined}
        >
          <UiInput
            id="pool-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={poolsLocked || saving}
            placeholder="confirm pool password"
            minLength={4}
            aria-invalid={Boolean(confirmPassword && password !== confirmPassword)}
          />
        </UiFormField>

        <UiButton
          type="submit"
          disabled={saving || poolsLocked}
          variant={poolsLocked ? "ghost" : "primary"}
          size="lg"
          fullWidth
        >
          {saving ? "Creating..." : poolsLocked ? "Pool Creation Locked" : "Create pool"}
        </UiButton>
      </form>

      <p className="app-form-note">
        {poolsLocked ? poolsLockedMessage : "New pools are private by default and require this password to join."}
      </p>

      {msg ? (
        <UiStatus
          tone={
            msg.toLowerCase().includes("created") || msg.toLowerCase().includes("success")
              ? "success"
              : "error"
          }
        >
          {msg}
        </UiStatus>
      ) : null}
    </main>
  );
}

export default function NewPoolPage() {
  return (
    <Suspense fallback={null}>
      <NewPoolPageContent />
    </Suspense>
  );
}
