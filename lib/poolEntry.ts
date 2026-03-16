import type { SupabaseClient } from "@supabase/supabase-js";

type EntryRow = {
  id: string;
  entry_name: string | null;
};

function isMissingEntryNameError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.entry_name does not exist") ||
    message.includes("Could not find the 'entry_name' column of 'entries' in the schema cache")
  );
}

export async function ensurePoolEntry(
  supabase: SupabaseClient,
  poolId: string,
  userId: string,
  fallbackName = "My Bracket"
): Promise<{ entry: EntryRow | null; error: string | null }> {
  const withName = await supabase
    .from("entries")
    .select("id,entry_name")
    .eq("pool_id", poolId)
    .eq("user_id", userId)
    .limit(1);

  if (!withName.error && withName.data?.length) {
    const existing = withName.data[0] as { id: string; entry_name: string | null };
    return { entry: { id: existing.id, entry_name: existing.entry_name }, error: null };
  }

  if (withName.error && !isMissingEntryNameError(withName.error.message)) {
    return { entry: null, error: withName.error.message };
  }

  if (withName.error && isMissingEntryNameError(withName.error.message)) {
    const fallbackExisting = await supabase
      .from("entries")
      .select("id")
      .eq("pool_id", poolId)
      .eq("user_id", userId)
      .limit(1);

    if (fallbackExisting.error) {
      return { entry: null, error: fallbackExisting.error.message };
    }

    const existingId = (fallbackExisting.data?.[0] as { id: string } | undefined)?.id ?? null;
    if (existingId) {
      return { entry: { id: existingId, entry_name: null }, error: null };
    }
  }

  const insertWithName = await supabase
    .from("entries")
    .insert({
      pool_id: poolId,
      user_id: userId,
      entry_name: fallbackName,
    })
    .select("id")
    .single();

  if (!insertWithName.error && insertWithName.data) {
    return { entry: { id: insertWithName.data.id as string, entry_name: fallbackName }, error: null };
  }

  if (insertWithName.error && !isMissingEntryNameError(insertWithName.error.message)) {
    return { entry: null, error: insertWithName.error.message };
  }

  const insertFallback = await supabase
    .from("entries")
    .insert({
      pool_id: poolId,
      user_id: userId,
    })
    .select("id")
    .single();

  if (insertFallback.error || !insertFallback.data) {
    return { entry: null, error: insertFallback.error?.message ?? "Failed to create entry." };
  }

  return { entry: { id: insertFallback.data.id as string, entry_name: null }, error: null };
}

export async function trySetEntryName(
  supabase: SupabaseClient,
  entryId: string,
  entryName: string
): Promise<string | null> {
  const trimmedName = entryName.trim();
  if (!trimmedName) return null;

  const { error } = await supabase
    .from("entries")
    .update({ entry_name: trimmedName })
    .eq("id", entryId);

  if (!error) return null;
  if (isMissingEntryNameError(error.message)) return null;
  return error.message;
}
