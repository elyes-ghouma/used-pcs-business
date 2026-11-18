/**
 * Password rules for admin accounts. Length matters most (NIST SP 800-63B); we also reject the passwords attackers
 * try first. Supabase stores only a bcrypt hash; the app never sees or stores a password after sign-in.
 * The real, enforced minimum is also configurable in Supabase (Authentication -> Sign In / Providers -> Email).
 */
export const MIN_PASSWORD_LENGTH = 12;

const COMMON = new Set(
  [
    "password", "password1", "password123", "passw0rd", "qwerty", "qwertyuiop", "azertyuiop", "azerty", "letmein", "welcome",
    "admin", "administrator", "adminadmin", "iloveyou", "monkey", "dragon", "football", "baseball", "sunshine", "princess",
    "123456", "1234567", "12345678", "123456789", "1234567890", "12345678901", "123456789012", "111111", "000000", "abc123",
    "changeme", "trustno1", "gaming", "gamer", "gaminpc", "gamingpc", "usedpcs", "tunisie", "tunisia", "bismillah",
  ].map((s) => s.toLowerCase()),
);

export function validatePassword(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > 128) return "Use at most 128 characters.";
  const lower = password.toLowerCase();
  const stripped = lower.replace(/[^a-z0-9]/g, "");
  // A common word with digits or symbols added ("password1234", "Gaming2026!") is just as guessable as the word.
  const withoutTail = lower.replace(/[^a-z]+$/, "");
  if (COMMON.has(lower) || COMMON.has(stripped) || COMMON.has(withoutTail)) return "That password is too common. Choose something less guessable.";
  if (new Set(lower).size < 6) return "That password repeats too few different characters.";
  if (/^(.)\1+$/.test(password) || /^(0123456789|1234567890|abcdefghij)/.test(lower)) return "That password is a simple sequence.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "The password must not contain your email name.";
  return null;
}
