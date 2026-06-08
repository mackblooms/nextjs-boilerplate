import { NextResponse } from "next/server";
import { requireSiteAdmin } from "@/lib/adminAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type PoolRow = {
  id: string;
  competition_slug: string | null;
};

type PoolLeaderboardEntryRow = {
  pool_id: string;
  entry_id: string;
  user_id: string;
  display_name: string | null;
};

type EntryNameRow = {
  id: string;
  entry_name: string | null;
};

type EntryDetailRow = EntryNameRow & {
  saved_draft_id: string | null;
};

type EntryIdOnlyRow = {
  id: string;
};

type EntryPickRow = {
  entry_id: string;
  team_id: string;
};

type ProfileNameRow = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
};

type ProfileName = {
  display_name: string | null;
  full_name: string | null;
};

type DraftRow = {
  id: string;
  name: string | null;
  user_id: string;
  competition_slug?: string | null;
};

type DraftPickRow = {
  draft_id: string;
  team_id: string;
};

type AdminPoolEntryRow = {
  pool_id: string;
  entry_id: string;
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  entry_name: string | null;
  draft_name: string | null;
  picks_count: number;
  pick_signature: string | null;
};

type PoolMemberRow = {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
};

function isMissingEntryNameError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.entry_name does not exist") ||
    message.includes("Could not find the 'entry_name' column of 'entries' in the schema cache")
  );
}

function isMissingSavedDraftIdError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column entries.saved_draft_id does not exist") ||
    message.includes("Could not find the 'saved_draft_id' column of 'entries' in the schema cache")
  );
}

function isMissingSavedDraftCompetitionError(message?: string) {
  if (!message) return false;
  return (
    message.includes("column saved_drafts.competition_slug does not exist") ||
    message.includes("Could not find the 'competition_slug' column of 'saved_drafts' in the schema cache")
  );
}

function memberPrimaryLabel(member: PoolMemberRow) {
  const realName = member.full_name?.trim();
  if (realName) return realName;

  const nickname = member.display_name?.trim();
  if (nickname) return nickname;

  return member.user_id.slice(0, 8);
}

function sortMembersByLabel(a: PoolMemberRow, b: PoolMemberRow) {
  return memberPrimaryLabel(a).localeCompare(memberPrimaryLabel(b));
}

function toSignature(picks: Set<string>) {
  return picks.size > 0 ? Array.from(picks).sort().join("|") : null;
}

export async function POST(req: Request) {
  try {
    const auth = await requireSiteAdmin(req);
    if ("response" in auth) return auth.response;

    const body = await req.json().catch(() => ({}));
    const poolIds = Array.isArray(body.poolIds)
      ? Array.from(new Set(body.poolIds.filter((id: unknown): id is string => typeof id === "string" && Boolean(id.trim()))))
      : [];

    if (poolIds.length === 0) {
      return NextResponse.json({ membersByPool: {}, entriesByPool: {} });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: poolRows, error: poolErr } = await supabaseAdmin
      .from("pools")
      .select("id,competition_slug")
      .in("id", poolIds);

    if (poolErr) {
      return NextResponse.json({ error: poolErr.message }, { status: 400 });
    }

    const competitionByPoolId = new Map(
      ((poolRows ?? []) as PoolRow[]).map((pool) => [pool.id, pool.competition_slug ?? null]),
    );

    const { data: leaderboardRows, error: leaderboardErr } = await supabaseAdmin
      .from("pool_leaderboard")
      .select("pool_id,entry_id,user_id,display_name")
      .in("pool_id", poolIds)
      .order("display_name", { ascending: true });

    if (leaderboardErr) {
      return NextResponse.json({ error: leaderboardErr.message }, { status: 400 });
    }

    const allLeaderboardRows = (leaderboardRows ?? []) as PoolLeaderboardEntryRow[];
    const allUserIds = Array.from(new Set(allLeaderboardRows.map((row) => row.user_id)));
    const allEntryIds = Array.from(new Set(allLeaderboardRows.map((row) => row.entry_id)));

    let profileByUser = new Map<string, ProfileName>();
    if (allUserIds.length > 0) {
      const { data: profileRows, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("user_id,display_name,full_name")
        .in("user_id", allUserIds);

      if (!profileErr) {
        profileByUser = new Map(
          ((profileRows ?? []) as ProfileNameRow[]).map((row) => [
            row.user_id,
            {
              display_name: row.display_name ?? null,
              full_name: row.full_name ?? null,
            },
          ]),
        );
      }
    }

    const groupedMembers: Record<string, PoolMemberRow[]> = {};
    const seenMembers = new Set<string>();
    for (const row of allLeaderboardRows) {
      const key = `${row.pool_id}:${row.user_id}`;
      if (seenMembers.has(key)) continue;
      seenMembers.add(key);

      const profile = profileByUser.get(row.user_id);
      if (!groupedMembers[row.pool_id]) groupedMembers[row.pool_id] = [];
      groupedMembers[row.pool_id].push({
        user_id: row.user_id,
        display_name: profile?.display_name ?? row.display_name,
        full_name: profile?.full_name ?? null,
      });
    }

    for (const id of Object.keys(groupedMembers)) {
      groupedMembers[id].sort(sortMembersByLabel);
    }

    let entryNameById = new Map<string, string | null>();
    let savedDraftIdByEntryId = new Map<string, string | null>();
    if (allEntryIds.length > 0) {
      const withDetails = await supabaseAdmin
        .from("entries")
        .select("id,entry_name,saved_draft_id")
        .in("id", allEntryIds);

      if (!withDetails.error) {
        entryNameById = new Map(
          ((withDetails.data ?? []) as EntryDetailRow[]).map((row) => [row.id, row.entry_name ?? null]),
        );
        savedDraftIdByEntryId = new Map(
          ((withDetails.data ?? []) as EntryDetailRow[]).map((row) => [row.id, row.saved_draft_id ?? null]),
        );
      } else if (isMissingSavedDraftIdError(withDetails.error.message)) {
        const fallbackWithName = await supabaseAdmin
          .from("entries")
          .select("id,entry_name")
          .in("id", allEntryIds);

        if (!fallbackWithName.error) {
          entryNameById = new Map(
            ((fallbackWithName.data ?? []) as EntryNameRow[]).map((row) => [row.id, row.entry_name ?? null]),
          );
        } else if (isMissingEntryNameError(fallbackWithName.error.message)) {
          const fallback = await supabaseAdmin
            .from("entries")
            .select("id")
            .in("id", allEntryIds);

          if (!fallback.error) {
            entryNameById = new Map(
              ((fallback.data ?? []) as EntryIdOnlyRow[]).map((row) => [row.id, null]),
            );
          }
        }
      } else if (isMissingEntryNameError(withDetails.error.message)) {
        const fallback = await supabaseAdmin
          .from("entries")
          .select("id")
          .in("id", allEntryIds);

        if (!fallback.error) {
          entryNameById = new Map(
            ((fallback.data ?? []) as EntryIdOnlyRow[]).map((row) => [row.id, null]),
          );
        }
      } else {
        return NextResponse.json({ error: withDetails.error.message }, { status: 400 });
      }
    }

    const picksByEntry = new Map<string, Set<string>>();
    if (allEntryIds.length > 0) {
      const { data: pickRows, error: pickErr } = await supabaseAdmin
        .from("entry_picks")
        .select("entry_id,team_id")
        .in("entry_id", allEntryIds);

      if (pickErr) {
        return NextResponse.json({ error: pickErr.message }, { status: 400 });
      }

      for (const row of (pickRows ?? []) as EntryPickRow[]) {
        const picks = picksByEntry.get(row.entry_id) ?? new Set<string>();
        picks.add(row.team_id);
        picksByEntry.set(row.entry_id, picks);
      }
    }

    const entryDraftNameById = new Map<string, string | null>();
    const linkedDraftIds = Array.from(
      new Set(
        Array.from(savedDraftIdByEntryId.values()).filter((draftId): draftId is string => Boolean(draftId)),
      ),
    );

    if (linkedDraftIds.length > 0) {
      const { data: linkedDraftRows, error: linkedDraftErr } = await supabaseAdmin
        .from("saved_drafts")
        .select("id,name")
        .in("id", linkedDraftIds);

      if (!linkedDraftErr) {
        const nameByDraftId = new Map(
          ((linkedDraftRows ?? []) as DraftRow[]).map((draft) => [draft.id, draft.name?.trim() || null]),
        );
        for (const [entryId, savedDraftId] of savedDraftIdByEntryId) {
          if (!savedDraftId) continue;
          entryDraftNameById.set(entryId, nameByDraftId.get(savedDraftId) ?? null);
        }
      }
    }

    const unresolvedUserIds = new Set<string>();
    for (const row of allLeaderboardRows) {
      if (!entryNameById.get(row.entry_id)?.trim() && !entryDraftNameById.get(row.entry_id)?.trim()) {
        unresolvedUserIds.add(row.user_id);
      }
    }

    if (unresolvedUserIds.size > 0) {
      const draftQuery = await supabaseAdmin
        .from("saved_drafts")
        .select("id,name,user_id,competition_slug")
        .in("user_id", Array.from(unresolvedUserIds));

      let drafts: DraftRow[] = [];
      if (draftQuery.error && isMissingSavedDraftCompetitionError(draftQuery.error.message)) {
        const fallbackDraftQuery = await supabaseAdmin
          .from("saved_drafts")
          .select("id,name,user_id")
          .in("user_id", Array.from(unresolvedUserIds));

        if (!fallbackDraftQuery.error) {
          drafts = (fallbackDraftQuery.data ?? []) as DraftRow[];
        }
      } else if (!draftQuery.error) {
        drafts = (draftQuery.data ?? []) as DraftRow[];
      }

      if (drafts.length > 0) {
        const draftIds = drafts.map((draft) => draft.id);
        const { data: draftPickRows, error: draftPickErr } = await supabaseAdmin
          .from("saved_draft_picks")
          .select("draft_id,team_id")
          .in("draft_id", draftIds);

        if (!draftPickErr) {
          const picksByDraft = new Map<string, Set<string>>();
          for (const row of (draftPickRows ?? []) as DraftPickRow[]) {
            const picks = picksByDraft.get(row.draft_id) ?? new Set<string>();
            picks.add(row.team_id);
            picksByDraft.set(row.draft_id, picks);
          }

          const draftByUserCompetitionSignature = new Map<string, string>();
          for (const draft of drafts) {
            const picks = picksByDraft.get(draft.id) ?? new Set<string>();
            const draftName = draft.name?.trim();
            if (picks.size === 0 || !draftName) continue;
            const signature = toSignature(picks);
            if (!signature) continue;
            const competitionSlug = draft.competition_slug ?? "";
            draftByUserCompetitionSignature.set(`${draft.user_id}::${competitionSlug}::${signature}`, draftName);
            draftByUserCompetitionSignature.set(`${draft.user_id}::::${signature}`, draftName);
          }

          for (const row of allLeaderboardRows) {
            if (entryNameById.get(row.entry_id)?.trim() || entryDraftNameById.get(row.entry_id)?.trim()) continue;
            const signature = toSignature(picksByEntry.get(row.entry_id) ?? new Set<string>());
            if (!signature) continue;
            const competitionSlug = competitionByPoolId.get(row.pool_id) ?? "";
            const matched =
              draftByUserCompetitionSignature.get(`${row.user_id}::${competitionSlug}::${signature}`) ??
              draftByUserCompetitionSignature.get(`${row.user_id}::::${signature}`);
            if (matched) entryDraftNameById.set(row.entry_id, matched);
          }
        }
      }
    }

    const groupedEntries: Record<string, AdminPoolEntryRow[]> = {};
    for (const row of allLeaderboardRows) {
      const picks = picksByEntry.get(row.entry_id) ?? new Set<string>();
      const pickSignature = toSignature(picks);
      const profile = profileByUser.get(row.user_id);

      if (!groupedEntries[row.pool_id]) groupedEntries[row.pool_id] = [];
      groupedEntries[row.pool_id].push({
        pool_id: row.pool_id,
        entry_id: row.entry_id,
        user_id: row.user_id,
        display_name: profile?.display_name ?? row.display_name,
        full_name: profile?.full_name ?? null,
        entry_name: entryNameById.get(row.entry_id) ?? null,
        draft_name: entryDraftNameById.get(row.entry_id) ?? null,
        picks_count: picks.size,
        pick_signature: pickSignature,
      });
    }

    return NextResponse.json({
      membersByPool: groupedMembers,
      entriesByPool: groupedEntries,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
