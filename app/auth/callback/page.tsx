"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Signing you in…");
  const [details, setDetails] = useState("");

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // If we got a code param (common), exchange it for a session
        if (code) {
          setStatus("Exchanging code for session…");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        // If tokens are in the hash (sometimes), set session from them
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;

        if (hash) {
          const hashParams = new URLSearchParams(hash);
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");

          if (access_token && refresh_token) {
            setStatus("Saving session from token hash…");
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (error) throw error;
          }
        }

        // Confirm session exists locally
        setStatus("Confirming session…");
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!data.session) {
          setStatus("No session found.");
          setDetails(
            "We redirected back successfully, but no session was created. This usually means the redirect URL wasn’t /auth/callback or isn’t allowed in Supabase."
          );
          return;
        }

        setStatus("Signed in! Redirecting…");
        router.replace("/");
      } catch (e: any) {
        setStatus("Sign-in failed.");
        setDetails(e?.message ?? String(e));
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
