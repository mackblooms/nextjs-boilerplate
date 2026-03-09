import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const PREFIX = "scrypt";

export function hashPoolPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password, salt, KEY_BYTES);
  return `${PREFIX}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPoolPassword(password: string, encoded: string | null | undefined): boolean {
  if (!encoded) return false;

  const parts = encoded.split("$");
  if (parts.length !== 3) return false;

  const [algorithm, saltBase64, expectedBase64] = parts;
  if (algorithm !== PREFIX || !saltBase64 || !expectedBase64) return false;

  try {
    const salt = Buffer.from(saltBase64, "base64");
    const expected = Buffer.from(expectedBase64, "base64");
    if (!salt.length || !expected.length) return false;

    const actual = scryptSync(password, salt, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
