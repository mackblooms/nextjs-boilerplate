"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        // Case 1: Supabase sends a `code` query param (PKCE flow)
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          router.replace("/");
          return;
        }

        // Case 2: Supabase sends tokens in the URL hash (access_token/refresh_token)
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hash);
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) throw error;
          router.replace("/");
          return;
        }

        // If neither format is present, just go home
        router.replace("/");
      } catch (e) {
        console.error(e);
        router.replace("/login");
      }
    };

    run();
  }, [router]);

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Signing you in…</h1>
      <p style={{ marginTop: 8 }}>
        If this takes more than a few seconds, go back and request a new link.
      </p>
    </main>
  );
}
