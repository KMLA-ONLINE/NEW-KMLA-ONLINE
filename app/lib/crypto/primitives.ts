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
export const ARGON2_PARAMS = { t: 2, m: 19456, p: 1, dkLen: KEY_BYTES } as const

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
 * A deterministic per-account salt. The email is not secret and is known before
 * login, which is exactly what a salt needs to be: it only has to be unique per
 * account, so that one rainbow table cannot cover two of them.
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
 * AES-256-GCM. The nonce is random and prefixed to the ciphertext, so a sealed
 * blob is self-contained: `nonce(12) || ciphertext || tag(16)`.
 */
export async function seal(
  key: Uint8Array | CryptoKey,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const nonce = randomBytes(NONCE_BYTES)
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as BufferSource },
    await aesKey(key),
    plaintext as BufferSource
  )
  return concatBytes(nonce, new Uint8Array(ciphertext))
}

/** Throws if the key is wrong or the blob was tampered with -- GCM authenticates. */
export async function open(key: Uint8Array | CryptoKey, sealed: Uint8Array): Promise<Uint8Array> {
  if (sealed.length <= NONCE_BYTES) throw new Error("sealed blob is truncated")
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.subarray(0, NONCE_BYTES) as BufferSource },
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
