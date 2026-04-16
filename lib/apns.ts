import { createSign } from "crypto";
import { connect as connectHttp2 } from "http2";

type ApnsEnvironment = "development" | "production";

type ApnsPayload = {
  title: string;
  body: string;
  path?: string | null;
  poolId?: string | null;
  destination?: string | null;
};

function getEnv(name: string, fallbackNames: string[] = []) {
  const candidates = [name, ...fallbackNames];
  for (const candidate of candidates) {
    const value = process.env[candidate]?.trim();
    if (value) return value;
  }
  return null;
}

function decodePrivateKey(value: string) {
  if (value.includes("BEGIN PRIVATE KEY")) {
    return value.replace(/\\n/g, "\n");
  }

  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (decoded.includes("BEGIN PRIVATE KEY")) {
      return decoded.replace(/\\n/g, "\n");
    }
  } catch {
    // ignore and fall through
  }

  return value.replace(/\\n/g, "\n");
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function createApnsJwt() {
  const teamId = getEnv("APNS_TEAM_ID", ["APPLE_TEAM_ID"]);
  const keyId = getEnv("APNS_KEY_ID", ["APPLE_KEY_ID"]);
  const privateKeyRaw = getEnv("APNS_PRIVATE_KEY", ["APPLE_PUSH_PRIVATE_KEY", "APPLE_PUSH_KEY"]);

  if (!teamId || !keyId || !privateKeyRaw) {
    throw new Error(
      "APNS credentials missing. Set APNS_TEAM_ID, APNS_KEY_ID, and APNS_PRIVATE_KEY.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 30) {
    return cachedToken.token;
  }

  const header = base64Url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64Url(JSON.stringify({ iss: teamId, iat: now }));
  const unsigned = `${header}.${claims}`;

  const signer = createSign("sha256");
  signer.update(unsigned);
  signer.end();

  const signature = signer.sign(decodePrivateKey(privateKeyRaw));
  const token = `${unsigned}.${base64Url(signature)}`;
  cachedToken = {
    token,
    expiresAt: now + 50 * 60,
  };
  return token;
}

export function getApnsConfig() {
  const topic = getEnv("APNS_TOPIC", ["APPLE_PUSH_TOPIC"]) ?? "com.mackbloom.bracketball";
  const environmentRaw = getEnv("APNS_ENVIRONMENT", ["APPLE_PUSH_ENVIRONMENT", "APNS_USE_SANDBOX"]);

  let environment: ApnsEnvironment = "production";
  if (environmentRaw === "development" || environmentRaw === "sandbox" || environmentRaw === "true") {
    environment = "development";
  }

  const authority =
    environment === "development"
      ? "https://api.sandbox.push.apple.com"
      : "https://api.push.apple.com";

  return {
    authority,
    environment,
    topic,
    token: createApnsJwt(),
  };
}

export async function sendApnsNotification(deviceToken: string, payload: ApnsPayload) {
  const config = getApnsConfig();

  const body = JSON.stringify({
    aps: {
      alert: {
        title: payload.title,
        body: payload.body,
      },
      sound: "default",
    },
    path: payload.path ?? undefined,
    poolId: payload.poolId ?? undefined,
    destination: payload.destination ?? undefined,
    url: payload.path ?? undefined,
  });

  return await new Promise<{ ok: true; apnsId: string | null; environment: ApnsEnvironment }>((resolve, reject) => {
    const client = connectHttp2(config.authority);

    client.on("error", (error) => {
      client.close();
      reject(error);
    });

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${config.token}`,
      "apns-topic": config.topic,
      "apns-push-type": "alert",
      "content-type": "application/json",
    });

    let responseBody = "";
    let statusCode = 0;
    let apnsId: string | null = null;

    request.setEncoding("utf8");
    request.on("response", (headers) => {
      statusCode = Number(headers[":status"] ?? 0);
      apnsId = typeof headers["apns-id"] === "string" ? headers["apns-id"] : null;
    });
    request.on("data", (chunk) => {
      responseBody += chunk;
    });
    request.on("end", () => {
      client.close();
      if (statusCode >= 200 && statusCode < 300) {
        resolve({ ok: true, apnsId, environment: config.environment });
        return;
      }

      let reason = responseBody;
      try {
        const parsed = JSON.parse(responseBody) as { reason?: string };
        if (parsed.reason) reason = parsed.reason;
      } catch {
        // keep raw response
      }

      reject(new Error(`APNs ${statusCode}: ${reason || "Unknown error"}`));
    });
    request.on("error", (error) => {
      client.close();
      reject(error);
    });

    request.end(body);
  });
}

