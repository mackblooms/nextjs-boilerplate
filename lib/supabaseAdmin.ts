import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  // Prefer server-only vars, but allow fallback to NEXT_PUBLIC URL for convenience
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Service role key MUST be server-side (never NEXT_PUBLIC)
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_SERVICE_ROLE_SECRET;

  if (!supabaseUrl) throw new Error("supabaseUrl is required.");
  if (!supabaseKey) throw new Error("supabaseKey is required.");

  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
}
