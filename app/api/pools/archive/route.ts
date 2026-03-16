import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isTournamentComplete,
  upsertPoolArchiveSnapshot,
  type PoolArchiveSnapshot,
} from "@/lib/poolArchive";

type ArchiveListRow = {
  season: number;
  created_at: string;
  updated_at: string;
};

type ArchiveDetailRow = ArchiveListRow & {
  snapshot: PoolArchiveSnapshot;
};

type AuthContext = {
  userId: string;
  isOwner: boolean;
};

type CreateArchiveRequest = {
  poolId?: string;
  season?: number;
  force?: boolean;
};

function isMissingPoolArchivesTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    message.includes("could not find the table 'public.pool_archives'") ||
    (error.code === "PGRST205" && message.includes("pool_archives"))
  );
}

function poolArchivesMigrationErrorResponse() {
  return NextResponse.json(
    {
      error:
        "Pool archives are not migrated yet. Run db/migrations/20260316_pool_archives.sql in Supabase SQL Editor, then refresh this page.",
    },
    { status: 503 },
  );
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function toSeason(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(String(value).trim());
  if (!Number.isFinite(n)) return null;
  const year = Math.trunc(n);
  if (year < 2000 || year > 2100) return null;
  return year;
}

async function requirePoolAccess(req: Request, poolId: string): Promise<AuthContext | NextResponse> {
  const supabaseAdmin = getSupabaseAdmin();

  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message ?? "Unauthorized." }, { status: 401 });
  }

  const userId = authData.user.id;

  const { data: memberRow, error: memberErr } = await supabaseAdmin
    .from("pool_members")
    .select("pool_id")
    .eq("pool_id", poolId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 400 });
  }

  if (!memberRow) {
    return NextResponse.json({ error: "Join this pool to view archives." }, { status: 403 });
  }

  const { data: poolRow, error: poolErr } = await supabaseAdmin
    .from("pools")
    .select("id,created_by")
    .eq("id", poolId)
    .maybeSingle();

  if (poolErr) {
    return NextResponse.json({ error: poolErr.message }, { status: 400 });
  }

  if (!poolRow) {
    return NextResponse.json({ error: "Pool not found." }, { status: 404 });
  }

  return {
    userId,
    isOwner: poolRow.created_by === userId,
  };
}

async function maybeAutoArchiveCurrentSeason(poolId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  const currentSeason = new Date().getUTCFullYear();

  const { data: existingRow, error: existingErr } = await supabaseAdmin
    .from("pool_archives")
    .select("season")
    .eq("pool_id", poolId)
    .eq("season", currentSeason)
    .maybeSingle();

  if (isMissingPoolArchivesTableError(existingErr)) {
    return;
  }

  if (existingErr || existingRow) {
    return;
  }

  const complete = await isTournamentComplete(supabaseAdmin).catch(() => false);
  if (!complete) {
    return;
  }

  await upsertPoolArchiveSnapshot(supabaseAdmin, poolId, currentSeason, null).catch(() => {
    // Archive generation is best-effort for implicit current-season snapshots.
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const poolId = url.searchParams.get("poolId")?.trim() ?? "";

    if (!poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }

    const auth = await requirePoolAccess(req, poolId);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const season = toSeason(url.searchParams.get("season"));
    const supabaseAdmin = getSupabaseAdmin();

    if (season != null) {
      const { data: row, error } = await supabaseAdmin
        .from("pool_archives")
        .select("season,created_at,updated_at,snapshot")
        .eq("pool_id", poolId)
        .eq("season", season)
        .maybeSingle();

      if (error) {
        if (isMissingPoolArchivesTableError(error)) {
          return poolArchivesMigrationErrorResponse();
        }
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      if (!row) {
        return NextResponse.json({ ok: true, archive: null, isOwner: auth.isOwner });
      }

      const typed = row as ArchiveDetailRow;
      const myEntry = typed.snapshot.entries.find((entry) => entry.user_id === auth.userId) ?? null;

      return NextResponse.json({
        ok: true,
        isOwner: auth.isOwner,
        archive: {
          season: typed.season,
          created_at: typed.created_at,
          updated_at: typed.updated_at,
          snapshot: typed.snapshot,
          my_entry: myEntry,
        },
      });
    }

    await maybeAutoArchiveCurrentSeason(poolId);

    const { data, error } = await supabaseAdmin
      .from("pool_archives")
      .select("season,created_at,updated_at")
      .eq("pool_id", poolId)
      .order("season", { ascending: false });

    if (error) {
      if (isMissingPoolArchivesTableError(error)) {
        return poolArchivesMigrationErrorResponse();
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      isOwner: auth.isOwner,
      seasons: ((data ?? []) as ArchiveListRow[]),
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      isMissingPoolArchivesTableError(error as { code?: string; message?: string })
    ) {
      return poolArchivesMigrationErrorResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CreateArchiveRequest;
    const poolId = body.poolId?.trim() ?? "";

    if (!poolId) {
      return NextResponse.json({ error: "poolId is required." }, { status: 400 });
    }

    const season = toSeason(body.season);
    if (!season) {
      return NextResponse.json({ error: "A valid season year is required." }, { status: 400 });
    }

    const auth = await requirePoolAccess(req, poolId);
    if (auth instanceof NextResponse) {
      return auth;
    }

    if (!auth.isOwner) {
      return NextResponse.json({ error: "Only the pool creator can save archives." }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const tournamentComplete = await isTournamentComplete(supabaseAdmin);
    if (!tournamentComplete && !body.force) {
      return NextResponse.json(
        {
          error:
            "Tournament is not final yet. Pass force=true only if you intentionally want a non-final snapshot.",
        },
        { status: 400 },
      );
    }

    const snapshot = await upsertPoolArchiveSnapshot(supabaseAdmin, poolId, season, auth.userId);

    return NextResponse.json({
      ok: true,
      season: snapshot.season,
      captured_at: snapshot.captured_at,
      entry_count: snapshot.entries.length,
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      isMissingPoolArchivesTableError(error as { code?: string; message?: string })
    ) {
      return poolArchivesMigrationErrorResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error." },
      { status: 500 },
    );
  }
}
