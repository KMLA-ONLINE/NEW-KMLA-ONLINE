import { beforeAll, describe, expect, it } from "vitest"

import {
  WrongPasswordError,
  WrongRecoveryCodeError,
  createAccount,
  deriveAuthHash,
  resealAccount,
  rotateAccount,
  unlockWithPassword,
  unlockWithRecoveryCode,
  type NewAccount,
} from "./account"
import { base64ToBytes, bytesEqual, bytesToBase64 } from "./encoding"
import { MessageCrypto, UndecryptableMessageError } from "./message"
import { open } from "./primitives"
import {
  formatRecoveryCode,
  generateRecoveryCode,
  isValidRecoveryCode,
  normalizeRecoveryCode,
} from "./recovery"

// Argon2id is ~500ms by design, and these tests run it for real rather than with
// weakened parameters -- the point is that the shipped configuration round-trips.
const TIMEOUT = 60_000

const ALICE_EMAIL = "alice@kmla.hs.kr"
const ALICE_PW = "correct horse battery staple"
const BOB_EMAIL = "bob@kmla.hs.kr"
const BOB_PW = "another entirely different one"

let alice: NewAccount
let bob: NewAccount

beforeAll(async () => {
  ;[alice, bob] = await Promise.all([
    createAccount(ALICE_PW, ALICE_EMAIL),
    createAccount(BOB_PW, BOB_EMAIL),
  ])
}, TIMEOUT)

describe("password derivation", () => {
  it(
    "is deterministic, and salted by email so two users sharing a password do not share a key",
    async () => {
      expect(deriveAuthHash(ALICE_PW, ALICE_EMAIL)).toBe(alice.authHash)
      expect(deriveAuthHash(ALICE_PW, ALICE_EMAIL)).toBe(
        deriveAuthHash(ALICE_PW, " Alice@KMLA.hs.kr ")
      )
      expect(deriveAuthHash(ALICE_PW, BOB_EMAIL)).not.toBe(alice.authHash)
    },
    TIMEOUT
  )

  it("hands Supabase Auth a hash that stays under bcrypt's 72-byte truncation", () => {
    expect(alice.authHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it(
    "gives the server nothing that unwraps the vault: authHash is not encKey",
    async () => {
      // This is the whole security claim. Supabase Auth stores a bcrypt of
      // `authHash`; even handed the pre-image itself, it does not open the vault,
      // because HKDF's two outputs are independent.
      await expect(
        open(base64ToBytes(alice.authHash), base64ToBytes(alice.stored.wrapped_user_key))
      ).rejects.toThrow()
    },
    TIMEOUT
  )
})

describe("unlock", () => {
  it(
    "recovers the same identity key from the password",
    async () => {
      const { keys, authHash } = await unlockWithPassword(ALICE_PW, ALICE_EMAIL, alice.stored)
      expect(authHash).toBe(alice.authHash)
      expect(bytesEqual(keys.userKey, alice.keys.userKey)).toBe(true)
      expect(bytesEqual(keys.identity.secretKey, alice.keys.identity.secretKey)).toBe(true)
      expect(bytesToBase64(keys.identity.publicKey)).toBe(alice.stored.identity_public_key)
    },
    TIMEOUT
  )

  it(
    "rejects a wrong password instead of yielding a plausible wrong key",
    async () => {
      await expect(unlockWithPassword("wrong", ALICE_EMAIL, alice.stored)).rejects.toBeInstanceOf(
        WrongPasswordError
      )
    },
    TIMEOUT
  )

  it(
    "recovers the same identity key from the recovery code",
    async () => {
      const keys = await unlockWithRecoveryCode(alice.recoveryCode, ALICE_EMAIL, alice.stored)
      expect(bytesEqual(keys.userKey, alice.keys.userKey)).toBe(true)
      expect(bytesEqual(keys.identity.secretKey, alice.keys.identity.secretKey)).toBe(true)
    },
    TIMEOUT
  )

  it(
    "rejects a wrong recovery code",
    async () => {
      await expect(
        unlockWithRecoveryCode(generateRecoveryCode(), ALICE_EMAIL, alice.stored)
      ).rejects.toBeInstanceOf(WrongRecoveryCodeError)
    },
    TIMEOUT
  )
})

describe("password change", () => {
  it(
    "re-seals the vault without touching the identity key, so history stays readable",
    async () => {
      const NEW_PW = "a brand new password entirely"
      const resealed = await resealAccount(alice.keys, NEW_PW, ALICE_EMAIL)

      const { keys } = await unlockWithPassword(NEW_PW, ALICE_EMAIL, resealed.stored)
      // The property the whole indirection through userKey exists for: not one
      // message is re-encrypted, because the identity key never moved.
      expect(bytesEqual(keys.identity.secretKey, alice.keys.identity.secretKey)).toBe(true)
      expect(resealed.stored.identity_public_key).toBe(alice.stored.identity_public_key)

      await expect(
        unlockWithPassword(ALICE_PW, ALICE_EMAIL, resealed.stored)
      ).rejects.toBeInstanceOf(WrongPasswordError)
    },
    TIMEOUT
  )

  it(
    "retires the old recovery code, which no longer unwraps anything",
    async () => {
      const resealed = await resealAccount(alice.keys, "yet another password", ALICE_EMAIL)
      expect(resealed.recoveryCode).not.toBe(alice.recoveryCode)

      await expect(
        unlockWithRecoveryCode(alice.recoveryCode, ALICE_EMAIL, resealed.stored)
      ).rejects.toBeInstanceOf(WrongRecoveryCodeError)
      await expect(
        unlockWithRecoveryCode(resealed.recoveryCode, ALICE_EMAIL, resealed.stored)
      ).resolves.toBeDefined()
    },
    TIMEOUT
  )
})

describe("messages", () => {
  const recipientsOf = (account: NewAccount) => [
    { userId: 1, publicKey: account.keys.identity.publicKey },
  ]

  it("lets the recipient decrypt, and the sender read their own message back", async () => {
    const aliceCrypto = new MessageCrypto(alice.keys)
    const bobCrypto = new MessageCrypto(bob.keys)

    const sent = await aliceCrypto.encrypt("오늘 저녁 뭐 먹어?", recipientsOf(bob))

    // One row per recipient. In a direct chat that is one row total: the sender
    // reads it back through the same Diffie-Hellman the recipient uses.
    expect(sent.keys).toHaveLength(1)
    expect(await bobCrypto.decrypt(sent.contentCiphertext, sent.keys[0])).toBe("오늘 저녁 뭐 먹어?")
    expect(await aliceCrypto.decrypt(sent.contentCiphertext, sent.keys[0])).toBe(
      "오늘 저녁 뭐 먹어?"
    )
  })

  it(
    "leaves an eavesdropper with nothing, even one holding the wrapped key",
    async () => {
      const aliceCrypto = new MessageCrypto(alice.keys)
      const sent = await aliceCrypto.encrypt("비밀", recipientsOf(bob))

      const eve = await createAccount("eve", "eve@kmla.hs.kr")
      await expect(
        new MessageCrypto(eve.keys).decrypt(sent.contentCiphertext, sent.keys[0])
      ).rejects.toBeInstanceOf(UndecryptableMessageError)
    },
    TIMEOUT
  )

  it("rejects a tampered ciphertext rather than returning garbage", async () => {
    const aliceCrypto = new MessageCrypto(alice.keys)
    const sent = await aliceCrypto.encrypt("송금해줘", recipientsOf(bob))

    const bytes = base64ToBytes(sent.contentCiphertext)
    bytes[bytes.length - 1] ^= 1
    await expect(
      new MessageCrypto(bob.keys).decrypt(bytesToBase64(bytes), sent.keys[0])
    ).rejects.toThrow()
  })

  it("seals attachments under the same message key, with their own nonce", async () => {
    const aliceCrypto = new MessageCrypto(alice.keys)
    const bobCrypto = new MessageCrypto(bob.keys)

    const file = new Uint8Array(4096).map((_, i) => i % 251)
    const sent = await aliceCrypto.encrypt("사진 보냄", recipientsOf(bob))
    const blob = await aliceCrypto.encryptAttachment(file, sent.messageKey)

    const messageKey = await bobCrypto.unwrapMessageKey(sent.keys[0])
    expect(bytesEqual(await bobCrypto.decryptAttachment(blob, messageKey), file)).toBe(true)
    // Same key, different nonce: the two blobs must not share a prefix.
    expect(
      bytesEqual(blob.subarray(0, 12), base64ToBytes(sent.contentCiphertext).subarray(0, 12))
    ).toBe(false)
  })

  it(
    "makes a rotated account's old messages unreadable and its new ones fine, with no rekeying",
    async () => {
      const bobCrypto = new MessageCrypto(bob.keys)
      const before = await new MessageCrypto(alice.keys).encrypt("갈아엎기 전", recipientsOf(bob))

      // Alice forgets both her password and her recovery code. Everything is new.
      const reborn = await rotateAccount("a fresh start", ALICE_EMAIL)
      const rebornCrypto = new MessageCrypto(reborn.keys)

      // She cannot read what she sent, and neither can Bob's copy help her: the
      // row names a public key she no longer holds.
      await expect(
        rebornCrypto.decrypt(before.contentCiphertext, before.keys[0])
      ).rejects.toBeInstanceOf(UndecryptableMessageError)
      // Bob still reads his own history perfectly well.
      expect(await bobCrypto.decrypt(before.contentCiphertext, before.keys[0])).toBe("갈아엎기 전")

      // And the next message just works. No epoch bump, no handshake, no rekey.
      const after = await rebornCrypto.encrypt("갈아엎은 후", recipientsOf(bob))
      expect(await bobCrypto.decrypt(after.contentCiphertext, after.keys[0])).toBe("갈아엎은 후")
      expect(await rebornCrypto.decrypt(after.contentCiphertext, after.keys[0])).toBe("갈아엎은 후")
    },
    TIMEOUT
  )
})

describe("recovery code", () => {
  it("is 120 bits in six writable groups, with no character that reads as another", () => {
    const code = generateRecoveryCode()
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){5}$/)
    expect(isValidRecoveryCode(code)).toBe(true)
  })

  it("forgives the ways a handwritten code gets mistyped", () => {
    expect(normalizeRecoveryCode("abcd efgh-jkmn")).toBe("ABCDEFGHJKMN")
    // I, L and O are not in the alphabet, so they can only ever be 1, 1 and 0.
    expect(normalizeRecoveryCode("I1-LO")).toBe("1110")
    expect(formatRecoveryCode("9wq4m2xk0j7pvbht5n3rycd8")).toBe("9WQ4-M2XK-0J7P-VBHT-5N3R-YCD8")
  })

  it("rejects a code of the wrong length or alphabet", () => {
    expect(isValidRecoveryCode("TOO-SHORT")).toBe(false)
    expect(isValidRecoveryCode("UUUU-UUUU-UUUU-UUUU-UUUU-UUUU")).toBe(false)
  })
})
