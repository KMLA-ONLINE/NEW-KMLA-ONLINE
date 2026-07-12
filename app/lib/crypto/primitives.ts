/**
 * The three primitives everything else is built from: a KDF, an AEAD, and a
 * Diffie-Hellman.
 *
 * WebCrypto for AES-GCM and @noble for Argon2id/HKDF/X25519. Not libsodium: it
 * would cost a ~400KB WASM payload on a login screen, and there is nothing to
 * interoperate with -- both ends of every message are this file.
 */
import { argon2id } from "@noble/hashes/argon2.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { x25519 } from "@noble/curves/ed25519.js"

import { concatBytes, utf8ToBytes } from "./encoding"

export const KEY_BYTES = 32
export const NONCE_BYTES = 12

/**
 * OWASP's minimum Argon2id configuration (19 MiB, 2 passes). Measured at ~470ms
 * in pure JS on a desktop; call it ~2s on a phone. That is the entire cost of a
 * login, and it is the only thing standing between a stolen `wrapped_user_key`
 * and an offline password guess, so it is not somewhere to save 400ms.
 *
 * These params are hardcoded rather than read from the server because the client
 * must derive `authHash` *before* it can authenticate, and an endpoint that
 * served per-email KDF params would be an account-enumeration oracle. Raising
 * them later means trying the new params first and falling back to the old ones.
 */
const ARGON2_PARAMS = { t: 2, m: 19456, p: 1, dkLen: KEY_BYTES } as const

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

/** Argon2id. Slow on purpose. */
export function deriveKeyFromPassword(password: string, salt: Uint8Array): Uint8Array {
  return argon2id(password, salt, ARGON2_PARAMS)
}

/** HKDF-SHA256. For splitting one high-entropy key into several unrelated ones. */
export function deriveSubkey(key: Uint8Array, info: string, salt?: Uint8Array): Uint8Array {
  return hkdf(sha256, key, salt, utf8ToBytes(info), KEY_BYTES)
}

/**
 * 계정별 결정적 salt. 이메일은 비밀이 아니고 로그인 전에 알 수 있는데, salt에 필요한 성질이
 * 정확히 그거다 -- 계정마다 유일하기만 하면 된다(하나의 레인보우 테이블이 두 계정을 덮지
 * 못하도록).
 *
 * ⚠️ **이메일이 곧 salt다. 이메일이 바뀌면 금고가 영영 안 열린다.**
 *
 * auth.users.email이 바뀌면 masterKey도, encKey도, 복구키도 전부 달라진다. 그러면 옛
 * 이메일로 봉인된 wrapped_user_key와 recovery_wrapped_user_key를 **비밀번호를 알아도, 복구
 * 코드를 알아도** 열 수 없다. 그 사람의 DM은 그 자리에서 영구히 죽는다.
 *
 * 지금 앱에는 이메일 변경 UI가 없지만 Supabase 대시보드에서 운영자가 직접 바꿀 수 있고,
 * Auth 설정도 이메일 변경을 허용한다. 이메일 변경 기능을 만들려면 **반드시** 그 트랜잭션 안에서
 * 옛 비밀번호로 금고를 먼저 열고 새 이메일 salt로 다시 봉인해야 한다(resealAccount와 같은
 * 모양이되 email이 바뀌는 버전). 그 코드 없이 이메일만 바꾸면 조용히 계정을 벽돌로 만든다.
 * docs/e2ee.md 참고.
 */
export function accountSalt(email: string, domain: string): Uint8Array {
  return sha256(utf8ToBytes(`${domain}|${email.trim().toLowerCase()}`)).slice(0, 16)
}

/**
 * A key that WebCrypto will use but never hand back. Stored in IndexedDB so an
 * unlocked session survives a page reload without keeping the password around --
 * and so that a script which gets into the origin can *use* it but cannot copy it
 * out. See ./vault.ts.
 */
export function importUnextractableKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", key as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ])
}

async function aesKey(key: Uint8Array | CryptoKey): Promise<CryptoKey> {
  return key instanceof Uint8Array ? importUnextractableKey(key) : key
}

/**
 * `label`은 AES-GCM의 AAD(additional authenticated data)다. 암호문에 실려 가지는 않지만
 * 태그에 섞이므로, **다른 label로 봉인된 blob은 열리지 않는다.**
 *
 * 이게 필요한 이유: 한 메시지의 본문·첨부·파일명은 전부 **같은 messageKey**로 봉인된다
 * (nonce만 다르다). label이 없으면 셋은 서로 완벽히 유효한 봉인이라, DB에 쓸 수 있는 자가
 * content_ciphertext 자리에 그 메시지의 파일명 암호문을 끼워 넣어도 GCM이 통과시킨다 --
 * 수신자는 에러 없이 엉뚱한 문자열을 본다. label이 각 암호문을 자기 자리에 묶는다.
 *
 * 이것이 막지 못하는 것: 메시지 **전체**(암호문 + 봉투)를 다른 메시지 자리로 옮기거나 지우는
 * 것. 서버는 어차피 메시지를 지우고 순서를 바꿀 수 있고, 종단간 암호화가 주는 것은 기밀성이지
 * 서버에 대한 무결성이 아니다 -- docs/e2ee.md.
 */
type SealLabel = string

function aeadParams(nonce: Uint8Array, label?: SealLabel): AesGcmParams {
  return {
    name: "AES-GCM",
    iv: nonce as BufferSource,
    ...(label ? { additionalData: utf8ToBytes(label) as BufferSource } : {}),
  }
}

/**
 * AES-256-GCM. The nonce is random and prefixed to the ciphertext, so a sealed
 * blob is self-contained: `nonce(12) || ciphertext || tag(16)`.
 */
export async function seal(
  key: Uint8Array,
  plaintext: Uint8Array,
  label?: SealLabel
): Promise<Uint8Array> {
  const nonce = randomBytes(NONCE_BYTES)
  const ciphertext = await crypto.subtle.encrypt(
    aeadParams(nonce, label),
    await aesKey(key),
    plaintext as BufferSource
  )
  return concatBytes(nonce, new Uint8Array(ciphertext))
}

/**
 * 키가 틀렸거나, 내용이 변조됐거나, **label이 다르면** 던진다.
 *
 * CryptoKey를 받는 것은 vault.ts의 재개 경로 하나뿐이다: 새로고침 뒤에는 encKey가 IndexedDB에
 * 추출 불가능한 CryptoKey로만 남아 있어 raw 바이트가 없다. seal 쪽에는 그런 호출자가 없어
 * Uint8Array만 받는다.
 */
export async function open(
  key: Uint8Array | CryptoKey,
  sealed: Uint8Array,
  label?: SealLabel
): Promise<Uint8Array> {
  if (sealed.length <= NONCE_BYTES) throw new Error("sealed blob is truncated")
  const plaintext = await crypto.subtle.decrypt(
    aeadParams(sealed.subarray(0, NONCE_BYTES), label),
    await aesKey(key),
    sealed.subarray(NONCE_BYTES) as BufferSource
  )
  return new Uint8Array(plaintext)
}

export type IdentityKeyPair = { publicKey: Uint8Array; secretKey: Uint8Array }

export function generateIdentityKeyPair(): IdentityKeyPair {
  const secretKey = x25519.utils.randomSecretKey()
  return { secretKey, publicKey: x25519.getPublicKey(secretKey) }
}

export function identityPublicKey(secretKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secretKey)
}

/**
 * X25519 between two long-term identity keys. Symmetric by construction:
 * `DH(a_secret, b_public) == DH(b_secret, a_public)`, which is why one wrapped
 * message key can be opened by both the sender and the recipient -- see
 * ./message.ts.
 *
 * No ephemeral key, so no forward secrecy: whoever learns an identity secret key
 * can read every message that key ever wrapped. That is a deliberate trade (a
 * ratchet needs stateful, ordered, online sessions) and it is the reason the
 * secret key never leaves the device unwrapped.
 */
export function sharedSecret(secretKey: Uint8Array, peerPublicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(secretKey, peerPublicKey)
}
