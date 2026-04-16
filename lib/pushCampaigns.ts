import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendApnsNotification } from "@/lib/apns";

export type ChangedWinnerGame = {
  gameId: string;
  winnerTeamId: string;
};

function uniqueChangedGames(changedGames: ChangedWinnerGame[]) {
  const seen = new Set<string>();
  const out: ChangedWinnerGame[] = [];

  for (const game of changedGames) {
    const key = `${game.gameId}:${game.winnerTeamId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(game);
  }

  return out;
}

export async function sendPoolFinalUpdateNotifications(changedGames: ChangedWinnerGame[]) {
  const uniqueGames = uniqueChangedGames(changedGames);
  if (uniqueGames.length === 0) {
    return { notificationsQueued: 0, notificationsSent: 0, notificationsSkipped: 0, notificationsFailed: 0 };
  }

  const supabaseAdmin = getSupabaseAdmin();
  const teamIds = Array.from(new Set(uniqueGames.map((game) => game.winnerTeamId)));

  const [{ data: teamRows, error: teamErr }, { data: poolRows, error: poolErr }, { data: memberRows, error: memberErr }, { data: deviceRows, error: deviceErr }, { data: entryRows, error: entryErr }, { data: pickRows, error: pickErr }] =
    await Promise.all([
      supabaseAdmin.from("teams").select("id,name").in("id", teamIds),
      supabaseAdmin.from("pools").select("id,name"),
      supabaseAdmin.from("pool_members").select("pool_id,user_id"),
      supabaseAdmin
        .from("push_devices")
        .select("installation_id,user_id,token,enabled,platform")
        .eq("platform", "ios")
        .eq("enabled", true)
        .not("token", "is", null),
      supabaseAdmin.from("entries").select("id,pool_id,user_id,entry_name"),
      supabaseAdmin.from("entry_picks").select("entry_id,team_id").in("team_id", teamIds),
    ]);

  if (teamErr) throw teamErr;
  if (poolErr) throw poolErr;
  if (memberErr) throw memberErr;
  if (deviceErr) throw deviceErr;
  if (entryErr) throw entryErr;
  if (pickErr) throw pickErr;

  const winnerNameByTeamId = new Map<string, string>();
  for (const row of teamRows ?? []) {
    winnerNameByTeamId.set(String(row.id), String(row.name ?? "A team"));
  }

  const poolNameById = new Map<string, string>();
  for (const row of poolRows ?? []) {
    poolNameById.set(String(row.id), String(row.name ?? "your pool"));
  }

  const devicesByUserId = new Map<string, Array<{ installation_id: string; token: string }>>();
  for (const row of deviceRows ?? []) {
    const userId = String(row.user_id ?? "").trim();
    const installationId = String(row.installation_id ?? "").trim();
    const token = String(row.token ?? "").trim();
    if (!userId || !installationId || !token) continue;

    const bucket = devicesByUserId.get(userId) ?? [];
    bucket.push({ installation_id: installationId, token });
    devicesByUserId.set(userId, bucket);
  }

  const entryById = new Map<
    string,
    { poolId: string; userId: string; entryName: string | null }
  >();
  for (const row of entryRows ?? []) {
    const entryId = String(row.id ?? "").trim();
    const poolId = String(row.pool_id ?? "").trim();
    const userId = String(row.user_id ?? "").trim();
    if (!entryId || !poolId || !userId) continue;
    entryById.set(entryId, {
      poolId,
      userId,
      entryName: typeof row.entry_name === "string" ? row.entry_name.trim() : null,
    });
  }

  const userWinningTeamsByPool = new Map<string, Array<{ teamId: string; entryName: string | null }>>();
  for (const row of pickRows ?? []) {
    const entryId = String(row.entry_id ?? "").trim();
    const teamId = String(row.team_id ?? "").trim();
    if (!entryId || !teamId) continue;

    const entry = entryById.get(entryId);
    if (!entry) continue;

    const key = `${entry.poolId}:${entry.userId}`;
    const bucket = userWinningTeamsByPool.get(key) ?? [];
    bucket.push({ teamId, entryName: entry.entryName });
    userWinningTeamsByPool.set(key, bucket);
  }

  let notificationsQueued = 0;
  let notificationsSent = 0;
  let notificationsSkipped = 0;
  let notificationsFailed = 0;

  for (const game of uniqueGames) {
    const winnerName = winnerNameByTeamId.get(game.winnerTeamId) ?? "A team";

    for (const member of memberRows ?? []) {
      const poolId = String(member.pool_id ?? "").trim();
      const userId = String(member.user_id ?? "").trim();
      if (!poolId || !userId) continue;

      const devices = devicesByUserId.get(userId) ?? [];
      if (devices.length === 0) continue;

      const poolName = poolNameById.get(poolId) ?? "your pool";
      const userPoolKey = `${poolId}:${userId}`;
      const winningEntries = (userWinningTeamsByPool.get(userPoolKey) ?? []).filter(
        (entry) => entry.teamId === game.winnerTeamId,
      );

      for (const device of devices) {
        const eventKey = `game-final:${game.gameId}:winner:${game.winnerTeamId}:pool:${poolId}:device:${device.installation_id}`;
        notificationsQueued++;

        const { error: insertErr } = await supabaseAdmin
          .from("push_notification_events")
          .insert({
            event_key: eventKey,
            user_id: userId,
            pool_id: poolId,
            device_installation_id: device.installation_id,
            channel: "apns",
            status: "pending",
          });

        if (insertErr) {
          if ((insertErr.message ?? "").toLowerCase().includes("duplicate")) {
            notificationsSkipped++;
            continue;
          }
          throw insertErr;
        }

        try {
          const personalized =
            winningEntries.length > 0
              ? winningEntries[0]?.entryName?.trim()
                ? `Your ${winningEntries[0].entryName} pick ${winnerName} is still alive in ${poolName}.`
                : `Your pick ${winnerName} is still alive in ${poolName}.`
              : `${winnerName} just changed the action in ${poolName}. Tap to check the leaderboard.`;

          await sendApnsNotification(device.token, {
            title: `${winnerName} advanced`,
            body: personalized,
            path: `/pool/${encodeURIComponent(poolId)}/leaderboard`,
            poolId,
            destination: "leaderboard",
          });

          notificationsSent++;
          await supabaseAdmin
            .from("push_notification_events")
            .update({ status: "sent" })
            .eq("event_key", eventKey);
        } catch (error: unknown) {
          notificationsFailed++;
          const message = error instanceof Error ? error.message : "Push delivery failed.";
          await supabaseAdmin
            .from("push_notification_events")
            .update({ status: "failed", error_message: message.slice(0, 500) })
            .eq("event_key", eventKey);
        }
      }
    }
  }

  return {
    notificationsQueued,
    notificationsSent,
    notificationsSkipped,
    notificationsFailed,
  };
}

export async function sendDraftLockReminderNotifications() {
  const supabaseAdmin = getSupabaseAdmin();
  const now = Date.now();
  const minMsUntilLock = 45 * 60 * 1000;
  const maxMsUntilLock = 75 * 60 * 1000;

  const [{ data: poolRows, error: poolErr }, { data: memberRows, error: memberErr }, { data: deviceRows, error: deviceErr }, { data: entryRows, error: entryErr }] =
    await Promise.all([
      supabaseAdmin.from("pools").select("id,name,lock_time").not("lock_time", "is", null),
      supabaseAdmin.from("pool_members").select("pool_id,user_id"),
      supabaseAdmin
        .from("push_devices")
        .select("installation_id,user_id,token,enabled,platform")
        .eq("platform", "ios")
        .eq("enabled", true)
        .not("token", "is", null),
      supabaseAdmin.from("entries").select("pool_id,user_id,id"),
    ]);

  if (poolErr) throw poolErr;
  if (memberErr) throw memberErr;
  if (deviceErr) throw deviceErr;
  if (entryErr) throw entryErr;

  const entryCountByPoolUser = new Map<string, number>();
  for (const row of entryRows ?? []) {
    const poolId = String(row.pool_id ?? "").trim();
    const userId = String(row.user_id ?? "").trim();
    if (!poolId || !userId) continue;
    const key = `${poolId}:${userId}`;
    entryCountByPoolUser.set(key, (entryCountByPoolUser.get(key) ?? 0) + 1);
  }

  const devicesByUserId = new Map<string, Array<{ installation_id: string; token: string }>>();
  for (const row of deviceRows ?? []) {
    const userId = String(row.user_id ?? "").trim();
    const installationId = String(row.installation_id ?? "").trim();
    const token = String(row.token ?? "").trim();
    if (!userId || !installationId || !token) continue;
    const bucket = devicesByUserId.get(userId) ?? [];
    bucket.push({ installation_id: installationId, token });
    devicesByUserId.set(userId, bucket);
  }

  let notificationsQueued = 0;
  let notificationsSent = 0;
  let notificationsSkipped = 0;
  let notificationsFailed = 0;

  for (const pool of poolRows ?? []) {
    const poolId = String(pool.id ?? "").trim();
    const poolName = String(pool.name ?? "your pool");
    const lockTime = typeof pool.lock_time === "string" ? pool.lock_time : null;
    if (!poolId || !lockTime) continue;

    const lockMs = Date.parse(lockTime);
    if (!Number.isFinite(lockMs)) continue;

    const msUntilLock = lockMs - now;
    if (msUntilLock < minMsUntilLock || msUntilLock > maxMsUntilLock) continue;

    const minutesUntilLock = Math.max(1, Math.round(msUntilLock / 60000));

    for (const member of memberRows ?? []) {
      const memberPoolId = String(member.pool_id ?? "").trim();
      const userId = String(member.user_id ?? "").trim();
      if (memberPoolId !== poolId || !userId) continue;

      const devices = devicesByUserId.get(userId) ?? [];
      if (devices.length === 0) continue;

      const entryCount = entryCountByPoolUser.get(`${poolId}:${userId}`) ?? 0;
      const body =
        entryCount > 0
          ? `${poolName} locks in about ${minutesUntilLock} minutes. You currently have ${entryCount} entr${entryCount === 1 ? "y" : "ies"} in.`
          : `${poolName} locks in about ${minutesUntilLock} minutes. You don't have any entries in yet.`;

      for (const device of devices) {
        const eventKey = `draft-lock:hour:${poolId}:device:${device.installation_id}`;
        notificationsQueued++;

        const { error: insertErr } = await supabaseAdmin
          .from("push_notification_events")
          .insert({
            event_key: eventKey,
            user_id: userId,
            pool_id: poolId,
            device_installation_id: device.installation_id,
            channel: "apns",
            status: "pending",
          });

        if (insertErr) {
          if ((insertErr.message ?? "").toLowerCase().includes("duplicate")) {
            notificationsSkipped++;
            continue;
          }
          throw insertErr;
        }

        try {
          await sendApnsNotification(device.token, {
            title: `${poolName} locks soon`,
            body,
            path: `/pool/${encodeURIComponent(poolId)}/draft`,
            poolId,
            destination: "draft",
          });
          notificationsSent++;
          await supabaseAdmin
            .from("push_notification_events")
            .update({ status: "sent" })
            .eq("event_key", eventKey);
        } catch (error: unknown) {
          notificationsFailed++;
          const message = error instanceof Error ? error.message : "Push delivery failed.";
          await supabaseAdmin
            .from("push_notification_events")
            .update({ status: "failed", error_message: message.slice(0, 500) })
            .eq("event_key", eventKey);
        }
      }
    }
  }

  return {
    notificationsQueued,
    notificationsSent,
    notificationsSkipped,
    notificationsFailed,
  };
}
