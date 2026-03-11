const DICEBEAR_STYLES = ["bottts", "bottts-neutral", "thumbs"] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getRandomMonsterAvatar(userId: string): string {
  const hash = hashString(userId);
  const style = DICEBEAR_STYLES[hash % DICEBEAR_STYLES.length];
  const seed = encodeURIComponent(userId);
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
}

export function withAvatarFallback(
  userId: string,
  avatarUrl: string | null | undefined,
): string {
  const trimmed = avatarUrl?.trim();
  return trimmed ? trimmed : getRandomMonsterAvatar(userId);
}
