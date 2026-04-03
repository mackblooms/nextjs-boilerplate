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

  const [{ data: teamRows, error: teamErr }, { data: poolRows, error: poolErr }, { data: memberRows, error: memberErr }, { data: deviceRows, error: deviceErr }] =
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
    ]);

  if (teamErr) throw teamErr;
  if (poolErr) throw poolErr;
  if (memberErr) throw memberErr;
  if (deviceErr) throw deviceErr;

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
          await sendApnsNotification(device.token, {
            title: `${winnerName} advanced`,
            body: `${winnerName} just changed the action in ${poolName}. Tap to check the leaderboard.`,
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

