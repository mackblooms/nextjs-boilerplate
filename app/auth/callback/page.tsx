"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getInvitePoolIdFromNextPath } from "../../../lib/poolInvite";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Signing you in...");
  const [details, setDetails] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const requestedNext = url.searchParams.get("next");
        const queryType = url.searchParams.get("type");
        const safeRequestedNext =
          requestedNext && requestedNext.startsWith("/") ? requestedNext : null;
        const invitePoolId =
          url.searchParams.get("invitePoolId") ||
          getInvitePoolIdFromNextPath(safeRequestedNext);

        const fallbackNextPath = invitePoolId ? `/pool/${invitePoolId}` : "/";
        const recoveryNextPath = (() => {
          const params = new URLSearchParams();
          params.set("next", fallbackNextPath);
          if (invitePoolId) params.set("invitePoolId", invitePoolId);
          return `/login/reset-password?${params.toString()}`;
        })();

        // If we got a code param (common), exchange it for a session.
        if (code) {
          setStatus("Exchanging code for session...");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // If tokens are in the hash (sometimes), set session from them.
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;

        if (hash) {
          const hashParams = new URLSearchParams(hash);
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          const hashType = hashParams.get("type");

          const nextPath =
            safeRequestedNext
              ? safeRequestedNext
              : (queryType || hashType) === "recovery"
                ? recoveryNextPath
                : fallbackNextPath;

          if (accessToken && refreshToken) {
            setStatus("Saving session from token hash...");
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
            setStatus("Signed in! Redirecting...");
            router.replace(nextPath);
            return;
          }
        }

        // Confirm session exists locally.
        setStatus("Confirming session...");
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session) {
          setStatus("No session found.");
          setDetails(
            "We redirected back successfully, but no session was created. This usually means the redirect URL was not /auth/callback or is not allowed in Supabase."
          );
          return;
        }

        const nextPath =
          safeRequestedNext
            ? safeRequestedNext
            : queryType === "recovery"
              ? recoveryNextPath
              : fallbackNextPath;

        setStatus("Signed in! Redirecting...");
        router.replace(nextPath);
      } catch (e: unknown) {
        setStatus("Sign-in failed.");
        const detail = e instanceof Error ? e.message : String(e);
        setDetails(detail);
      }
    };

    run();
  }, [router]);

  return (
    <main style={{ maxWidth: 720, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>{status}</h1>
      {details ? (
        <pre style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{details}</pre>
      ) : (
        <p style={{ marginTop: 10, opacity: 0.85 }}>
          If this takes more than a few seconds, go back and request a new link.
        </p>
      )}
    </main>
  );
}
