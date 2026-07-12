/**
 * The account key hierarchy. Everything hangs off the password, and nothing in
 * this file ever sends the password anywhere.
 *
 *   password ──Argon2id(salt=email)──► masterKey
 *                                        ├─HKDF "auth"─► authHash   → Supabase Auth (this is the "password" it stores)
 *                                        └─HKDF "enc"──► encKey     → never leaves the device
 *
 *   userKey (random, permanent) ──sealed by encKey──────► wrapped_user_key
 *                               └─sealed by recoveryKey─► recovery_wrapped_user_key
 *
 *   identity X25519 secret key ──sealed by userKey─────► wrapped_identity_secret_key
 *   identity X25519 public key ────────────────────────► published, readable by every accepted user
 *
 * Two things fall out of the indirection through `userKey`:
 *
 *   - Changing the password re-seals one 32-byte blob. Not a single message is
 *     re-encrypted, because messages are keyed off the identity key, which is
 *     keyed off `userKey`, which does not change.
 *   - The key is derived from the password, not from the device, so a phone and a
 *     laptop independently arrive at the same `userKey`. There is no device
 *     registration, no linking QR code, and no "safety number changed" to explain.
 *
 * The cost of that second property is stated plainly: someone who learns the
 * password can read everything, past and future, without touching the device.
 */
import { bytesToBase64, base64ToBytes, bytesToHex } from "./encoding"
import {
  KEY_BYTES,
  accountSalt,
  deriveKeyFromPassword,
  deriveSubkey,
  generateIdentityKeyPair,
  identityPublicKey,
  open,
  randomBytes,
  seal,
  type IdentityKeyPair,
} from "./primitives"
import { deriveRecoveryKey, generateRecoveryCode } from "./recovery"

/** The unlocked secrets. Held in memory for the session; never persisted as-is. */
export type AccountKeys = {
  userKey: Uint8Array
  identity: IdentityKeyPair
}

/** Mirrors public.user_keys one-to-one. Every field is base64 of a `bytea`. */
export type StoredUserKeys = {
  identity_public_key: string
  wrapped_user_key: string
  wrapped_identity_secret_key: string
  recovery_wrapped_user_key: string
}

export class WrongPasswordError extends Error {
  constructor() {
    super("비밀번호가 올바르지 않습니다.")
    this.name = "WrongPasswordError"
  }
}

export class WrongRecoveryCodeError extends Error {
  constructor() {
    super("복구 코드가 올바르지 않습니다.")
    this.name = "WrongRecoveryCodeError"
  }
}

function splitMasterKey(password: string, email: string) {
  const masterKey = deriveKeyFromPassword(password, accountSalt(email, "kmla-v1"))
  return {
    /** Hex, 64 chars. Stays under bcrypt's 72-byte truncation limit. */
    authHash: bytesToHex(deriveSubkey(masterKey, "kmla-auth-v1")),
    encKey: deriveSubkey(masterKey, "kmla-enc-v1"),
  }
}

/**
 * What Supabase Auth is given in place of the password. Login and signup call
 * this; nothing else in the app ever holds the raw password.
 */
export function deriveAuthHash(password: string, email: string): string {
  return splitMasterKey(password, email).authHash
}

/** userKey is never an AEAD key itself, so later uses of it get their own subkey. */
function identityWrapKey(userKey: Uint8Array): Uint8Array {
  return deriveSubkey(userKey, "kmla-identity-v1")
}

async function sealAccount(
  keys: AccountKeys,
  encKey: Uint8Array,
  recoveryKey: Uint8Array
): Promise<StoredUserKeys> {
  return {
    identity_public_key: bytesToBase64(keys.identity.publicKey),
    wrapped_user_key: bytesToBase64(await seal(encKey, keys.userKey)),
    wrapped_identity_secret_key: bytesToBase64(
      await seal(identityWrapKey(keys.userKey), keys.identity.secretKey)
    ),
    recovery_wrapped_user_key: bytesToBase64(await seal(recoveryKey, keys.userKey)),
  }
}

export type NewAccount = {
  authHash: string
  keys: AccountKeys
  stored: StoredUserKeys
  /** Shown to the user exactly once. Not recoverable from anything stored. */
  recoveryCode: string
}

/** Signup. */
export async function createAccount(password: string, email: string): Promise<NewAccount> {
  const { authHash, encKey } = splitMasterKey(password, email)
  const recoveryCode = generateRecoveryCode()
  const keys: AccountKeys = {
    userKey: randomBytes(KEY_BYTES),
    identity: generateIdentityKeyPair(),
  }
  return {
    authHash,
    keys,
    recoveryCode,
    stored: await sealAccount(keys, encKey, deriveRecoveryKey(recoveryCode, email)),
  }
}

async function unwrapIdentity(userKey: Uint8Array, stored: StoredUserKeys): Promise<AccountKeys> {
  const secretKey = await open(
    identityWrapKey(userKey),
    base64ToBytes(stored.wrapped_identity_secret_key)
  )
  return { userKey, identity: { secretKey, publicKey: identityPublicKey(secretKey) } }
}

/**
 * Login. `authHash` is returned alongside because the caller needs it for
 * Supabase Auth and re-deriving it would mean paying for Argon2id twice.
 */
export async function unlockWithPassword(
  password: string,
  email: string,
  stored: StoredUserKeys
): Promise<{ authHash: string; keys: AccountKeys }> {
  const { authHash, encKey } = splitMasterKey(password, email)
  let userKey: Uint8Array
  try {
    userKey = await open(encKey, base64ToBytes(stored.wrapped_user_key))
  } catch {
    // AES-GCM authenticates, so a wrong password fails here rather than yielding
    // a plausible-looking wrong key.
    throw new WrongPasswordError()
  }
  return { authHash, keys: await unwrapIdentity(userKey, stored) }
}

/** Password reset: the user has the code but not the old password. */
export async function unlockWithRecoveryCode(
  recoveryCode: string,
  email: string,
  stored: StoredUserKeys
): Promise<AccountKeys> {
  let userKey: Uint8Array
  try {
    userKey = await open(
      deriveRecoveryKey(recoveryCode, email),
      base64ToBytes(stored.recovery_wrapped_user_key)
    )
  } catch {
    throw new WrongRecoveryCodeError()
  }
  return unwrapIdentity(userKey, stored)
}

/**
 * Change or reset the password on keys that are already unlocked. Re-seals
 * `userKey` under the new `encKey` and mints a fresh recovery code -- the old one
 * unwraps a blob that is about to be overwritten, so leaving it valid would be a
 * lie.
 */
export async function resealAccount(
  keys: AccountKeys,
  newPassword: string,
  email: string
): Promise<{ authHash: string; stored: StoredUserKeys; recoveryCode: string }> {
  const { authHash, encKey } = splitMasterKey(newPassword, email)
  const recoveryCode = generateRecoveryCode()
  return {
    authHash,
    recoveryCode,
    stored: await sealAccount(keys, encKey, deriveRecoveryKey(recoveryCode, email)),
  }
}

/**
 * The last resort: neither the password nor the recovery code. Nothing can unwrap
 * the old `userKey`, so the account gets a brand new one and a brand new identity
 * key.
 *
 * Every message key ever sealed to the old identity key is now unopenable, by
 * anyone, forever -- which is what end-to-end encryption means and is not a bug to
 * be worked around. Messages sent from here on are sealed to the new key and read
 * normally; `message_keys` rows carry the public keys they were sealed under, so
 * the dead ones identify themselves and the client renders them as unreadable
 * rather than as an error. The peer keeps their own copy of the history either way.
 */
export async function rotateAccount(password: string, email: string): Promise<NewAccount> {
  return createAccount(password, email)
}
