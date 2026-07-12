/**
 * The recovery code: the second, independent way to unwrap `userKey`.
 *
 * Without it, a forgotten password is a permanent loss of every DM, because the
 * server holds nothing that can decrypt them -- that is the whole point. With it,
 * a password reset stays a password reset.
 *
 * 120 bits from the CSPRNG, in Crockford Base32 (no I/L/O/U, so nothing reads as
 * a different character when handwritten). Shown once, at signup.
 */
import { accountSalt, deriveKeyFromPassword } from "./primitives"
import { randomBytes } from "./primitives"

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const CODE_BYTES = 15 // 120 bits -> exactly 24 base32 characters, no padding
const GROUP = 4

/** e.g. "9WQ4-M2XK-0J7P-VBHT-5N3R-YCD8" */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(CODE_BYTES)

  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  return out.match(new RegExp(`.{1,${GROUP}}`, "g"))!.join("-")
}

/**
 * Forgiving on input: case, spaces and dashes do not matter, and the characters
 * Crockford dropped are folded back to the digit they look like. A user reading
 * their own handwriting should not be able to lose their DMs to a stray "O".
 */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0")
}

export function isValidRecoveryCode(code: string): boolean {
  const normalized = normalizeRecoveryCode(code)
  if (normalized.length !== Math.ceil((CODE_BYTES * 8) / 5)) return false
  return [...normalized].every((char) => ALPHABET.includes(char))
}

export function formatRecoveryCode(code: string): string {
  return (
    normalizeRecoveryCode(code)
      .match(new RegExp(`.{1,${GROUP}}`, "g"))
      ?.join("-") ?? ""
  )
}

/**
 * Argon2id, same cost as the password. The code has 120 bits of entropy and does
 * not strictly need a memory-hard KDF, but running one path instead of two is
 * worth the 500ms of a flow nobody takes twice.
 *
 * A different salt domain than the password, so the two keys stay unrelated even
 * though both are Argon2id over the same email.
 */
export function deriveRecoveryKey(code: string, email: string): Uint8Array {
  if (!isValidRecoveryCode(code)) throw new Error("invalid recovery code")
  return deriveKeyFromPassword(normalizeRecoveryCode(code), accountSalt(email, "kmla-recovery-v1"))
}
