/**
 * The account key hierarchy. Everything hangs off the password, and nothing in
 * this file ever sends the password anywhere.
 *
 *   password ──Argon2id(salt=email)──► masterKey
 *                                        ├─HKDF "auth"─► authHash   → Supabase Auth (this is the "password" it stores)
 *                                        └─HKDF "enc"──► encKey     → never leaves the device
 *
 *   userKey (random, permanent) ──sealed by encKey──────► wrapped_user_key
 *
 *   identity X25519 secret key ──sealed by userKey─────► wrapped_identity_secret_key
 *   identity X25519 public key ────────────────────────► published, readable by every accepted user
 *
 * Two things fall out of the indirection through `userKey`:
 *
 *   - Changing the password re-seals one 32-byte blob. Not a single message is
 *     re-encrypted, because messages are keyed off the identity key, which is
 *     keyed off `userKey`, which does not change.
 *   - `userKey` is random, but it is reached through the password, not the device:
 *     any device that knows the password derives the same `encKey` and unwraps the
 *     same `userKey`. There is no device registration, no linking QR code, and no
 *     "safety number changed" to explain.
 *
 * The cost of that second property is stated plainly: someone who learns the
 * password can read everything, past and future, without touching the device.
 *
 * There is deliberately no second way in. A forgotten password cannot recover the
 * old `userKey` -- only rotateAccount, which mints a brand new identity and gives
 * up every past DM. That is the whole point of end-to-end encryption, not a gap to
 * be filled with an escrow blob the server could be compelled to unwrap.
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
}

/**
 * 원인을 `cause`로 물고 간다. 이걸 안 하면 DB 손상이나 base64 버그가 전부 "비밀번호가
 * 틀렸습니다"로 위장되어, 운영 중에 진짜 원인을 추적할 방법이 사라진다.
 */
export class WrongPasswordError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("비밀번호가 올바르지 않습니다.", options)
    this.name = "WrongPasswordError"
  }
}

/**
 * 비밀번호에서 나오는 두 키. **Argon2id가 도는 유일한 곳이다.**
 *
 * 따로 export하는 이유: 로그인은 authHash(Supabase Auth로)와 encKey(금고 열기)를 둘 다
 * 필요로 한다. 두 번 유도하면 Argon2id가 두 번 돌아 로그인이 1초가 아니라 2초 멈춘다
 * (폰에서는 4초). 한 번 돌려서 둘 다 들고 다닌다.
 */
export type PasswordKeys = {
  /**
   * Hex 64자. 두 가지 제약을 동시에 만족해야 한다:
   *   - bcrypt의 72바이트 절단 한계 **아래**(64 < 72).
   *   - Supabase Auth의 비밀번호 정책을 **통과**. 지금 config.toml의 `password_requirements`가
   *     비어 있어서 통과하는데, 여기에 문자 클래스 제약(`lower_upper_letters_digits_symbols`
   *     같은 것)을 추가하면 소문자 hex는 대문자도 기호도 없으므로 **가입과 비밀번호 변경이
   *     전부 조용히 거부되기 시작한다.** 크립토와 무관해 보이는 config 한 줄이 원인이라 추적이
   *     지옥이다. 그 값을 건드리지 말 것.
   */
  authHash: string
  /** 서버로 절대 가지 않는다. */
  encKey: Uint8Array
}

export function derivePasswordKeys(password: string, email: string): PasswordKeys {
  const masterKey = deriveKeyFromPassword(password, accountSalt(email, "kmla-v1"))
  return {
    authHash: bytesToHex(deriveSubkey(masterKey, "kmla-auth-v1")),
    encKey: deriveSubkey(masterKey, "kmla-enc-v1"),
  }
}

/** userKey is never an AEAD key itself, so later uses of it get their own subkey. */
function identityWrapKey(userKey: Uint8Array): Uint8Array {
  return deriveSubkey(userKey, "kmla-identity-v1")
}

/**
 * 두 blob이 서로 **다른 키**로 봉인된다(encKey / identityWrapKey). 그래서 서로 자리를 바꿔치기해도
 * 그냥 안 열린다 -- 메시지 쪽과 달리 여기엔 AAD 라벨이 필요 없다.
 */
async function sealAccount(keys: AccountKeys, encKey: Uint8Array): Promise<StoredUserKeys> {
  return {
    identity_public_key: bytesToBase64(keys.identity.publicKey),
    wrapped_user_key: bytesToBase64(await seal(encKey, keys.userKey)),
    wrapped_identity_secret_key: bytesToBase64(
      await seal(identityWrapKey(keys.userKey), keys.identity.secretKey)
    ),
  }
}

export type NewAccount = {
  authHash: string
  keys: AccountKeys
  stored: StoredUserKeys
  /**
   * Handed straight to the vault, which imports it as a non-extractable
   * CryptoKey and drops these bytes. Nothing else should hold onto it.
   */
  encKey: Uint8Array
}

/** 이미 유도해 둔 키로 계정을 만든다. Argon2id를 다시 돌리지 않는다. */
export async function createAccountFromKeys({
  authHash,
  encKey,
}: PasswordKeys): Promise<NewAccount> {
  const keys: AccountKeys = {
    userKey: randomBytes(KEY_BYTES),
    identity: generateIdentityKeyPair(),
  }
  return {
    authHash,
    keys,
    encKey,
    stored: await sealAccount(keys, encKey),
  }
}

/** Signup. */
export async function createAccount(password: string, email: string): Promise<NewAccount> {
  return createAccountFromKeys(derivePasswordKeys(password, email))
}

async function unwrapIdentity(userKey: Uint8Array, stored: StoredUserKeys): Promise<AccountKeys> {
  const secretKey = await open(
    identityWrapKey(userKey),
    base64ToBytes(stored.wrapped_identity_secret_key)
  )
  return { userKey, identity: { secretKey, publicKey: identityPublicKey(secretKey) } }
}

/** 이미 유도해 둔 키로 금고를 연다. Argon2id를 다시 돌리지 않는다. */
export async function unlockWithKeys(
  { encKey }: PasswordKeys,
  stored: StoredUserKeys
): Promise<AccountKeys> {
  let userKey: Uint8Array
  try {
    userKey = await open(encKey, base64ToBytes(stored.wrapped_user_key))
  } catch (cause) {
    // AES-GCM이 인증하므로 비밀번호가 틀리면 그럴듯한 엉뚱한 키가 나오는 대신 여기서 실패한다.
    // 다만 base64 손상이나 DB 손상도 같은 자리에서 터지므로, 원인을 물고 가지 않으면 그것들이
    // 전부 "비밀번호가 틀렸습니다"로 위장된다.
    throw new WrongPasswordError({ cause })
  }
  return unwrapIdentity(userKey, stored)
}

export async function unlockWithPassword(
  password: string,
  email: string,
  stored: StoredUserKeys
): Promise<{ authHash: string; encKey: Uint8Array; keys: AccountKeys }> {
  const passwordKeys = derivePasswordKeys(password, email)
  return {
    ...passwordKeys,
    keys: await unlockWithKeys(passwordKeys, stored),
  }
}

/**
 * Reopening a session that is still logged in but whose keys went away with the
 * page -- a refresh, a new tab. The password is long gone; what survives is the
 * non-extractable `encKey` the vault kept in IndexedDB.
 */
export async function unlockWithEncKey(
  encKey: CryptoKey,
  stored: StoredUserKeys
): Promise<AccountKeys> {
  let userKey: Uint8Array
  try {
    userKey = await open(encKey, base64ToBytes(stored.wrapped_user_key))
  } catch (cause) {
    // The stored key no longer opens the vault: the password was changed
    // somewhere else. Ask for the password again rather than guessing.
    throw new WrongPasswordError({ cause })
  }
  return unwrapIdentity(userKey, stored)
}

/**
 * Change the password on keys that are already unlocked. Re-seals `userKey` under
 * the new `encKey` and nothing else -- not one message is re-encrypted, because the
 * identity key lives under `userKey`, which does not move. The old password's
 * `encKey` stops opening the vault.
 */
export async function resealAccount(
  keys: AccountKeys,
  newPassword: string,
  email: string
): Promise<{
  authHash: string
  encKey: Uint8Array
  stored: StoredUserKeys
}> {
  const { authHash, encKey } = derivePasswordKeys(newPassword, email)
  return {
    authHash,
    encKey,
    stored: await sealAccount(keys, encKey),
  }
}

/**
 * The last resort: the password is gone. There is no second key to recover the old
 * `userKey` -- by design -- so the account gets a brand new one and a brand new
 * identity key.
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
