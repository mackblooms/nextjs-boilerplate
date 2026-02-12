"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function AuthStatus() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
  const load = async () => {
    const { data } = await supabase.auth.getSession();
    setEmail(data.session?.user?.email ?? null);
  };

  load();

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    setEmail(session?.user?.email ?? null);
  });

  return () => sub.subscription.unsubscribe();
}, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (!email) {
    return (
      <div style={{ marginBottom: 16 }}>
        <a href="/login" style={{ fontWeight: 700 }}>
          Login
        </a>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      Signed in as <b>{email}</b>{" "}
      <button onClick={signOut} style={{ marginLeft: 12, fontWeight: 700 }}>
        Sign out
      </button>
    </div>
  );
}
