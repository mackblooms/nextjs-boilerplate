export const PASSWORD_MIN_LENGTH = 6;
const GENERATED_PASSWORD_LENGTH = 16;

function randomInt(max: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

export function generateStrongPassword(length = GENERATED_PASSWORD_LENGTH): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*()-_=+[]{}";
  const allChars = upper + lower + digits + symbols;
  const finalLength = Math.max(length, PASSWORD_MIN_LENGTH);

  const chars = [
    upper[randomInt(upper.length)],
    lower[randomInt(lower.length)],
    digits[randomInt(digits.length)],
    symbols[randomInt(symbols.length)],
  ];

  while (chars.length < finalLength) {
    chars.push(allChars[randomInt(allChars.length)]);
  }

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}
