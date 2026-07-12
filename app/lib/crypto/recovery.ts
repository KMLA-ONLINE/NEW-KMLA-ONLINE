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
import { utf8ToBytes } from "./encoding"
import { accountSalt, deriveSubkey, randomBytes } from "./primitives"

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
 * Argon2id가 **아니라** HKDF다.
 *
 * 메모리-하드 KDF는 *추측 가능한* 비밀을 오프라인에서 때리는 비용을 올리는 도구다. 복구 코드는
 * CSPRNG에서 나온 120비트라 추측 자체가 성립하지 않으므로, Argon2id가 여기서 사 주는 것은 없다.
 *
 * (처음엔 "경로를 하나로 통일하는 값이 500ms보다 크다"며 Argon2id를 썼는데, 그 전제가 틀렸다:
 *  이건 한 번뿐인 흐름이 아니라 **가입과 비밀번호 변경·재설정 때마다** 도는 경로다. 비밀번호
 *  쪽에서 이미 Argon2id를 한 번 돌리므로, 여기서 또 돌리면 그 화면들이 두 배로 멈춘다.)
 *
 * salt 도메인이 비밀번호 쪽과 다르므로 두 키는 서로 무관하다.
 */
export function deriveRecoveryKey(code: string, email: string): Uint8Array {
  if (!isValidRecoveryCode(code)) throw new Error("invalid recovery code")
  return deriveSubkey(
    utf8ToBytes(normalizeRecoveryCode(code)),
    "kmla-recovery-v1",
    accountSalt(email, "kmla-recovery-v1")
  )
}
