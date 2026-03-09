import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "aesgcm";
const IV_BYTES = 12;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(`pool-password-v1:${secret}`).digest();
}

function resolveSecret(): string {
  const explicit = process.env.POOL_PASSWORD_ENCRYPTION_KEY?.trim();
  if (explicit) return explicit;

  const fallback =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_SERVICE_ROLE_SECRET;

  if (!fallback) {
    throw new Error("No encryption secret configured for pool passwords.");
  }

  return fallback;
}

export function encryptPoolPassword(password: string): string {
  const key = deriveKey(resolveSecret());
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}$${iv.toString("base64")}$${ciphertext.toString("base64")}$${authTag.toString("base64")}`;
}

export function decryptPoolPassword(encoded: string | null | undefined): string | null {
  if (!encoded) return null;

  const parts = encoded.split("$");
  if (parts.length !== 4) return null;

  const [algorithm, ivBase64, ciphertextBase64, authTagBase64] = parts;
  if (algorithm !== PREFIX || !ivBase64 || !ciphertextBase64 || !authTagBase64) return null;

  try {
    const key = deriveKey(resolveSecret());
    const iv = Buffer.from(ivBase64, "base64");
    const ciphertext = Buffer.from(ciphertextBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
