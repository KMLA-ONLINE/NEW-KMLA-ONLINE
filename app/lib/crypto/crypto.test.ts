import { beforeAll, describe, expect, it } from "vitest"

import {
  WrongPasswordError,
  createAccount,
  derivePasswordKeys,
  resealAccount,
  rotateAccount,
  unlockWithPassword,
  type NewAccount,
} from "./account"
import {
  base64ToBytes,
  bytesEqual,
  bytesToBase64,
  bytesToHex,
  bytesToUtf8,
  utf8ToBytes,
} from "./encoding"
import { MessageCrypto, UndecryptableMessageError } from "./message"
import { SEAL_VERSION, open, randomBytes, seal } from "./primitives"

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
      expect(derivePasswordKeys(ALICE_PW, ALICE_EMAIL).authHash).toBe(alice.authHash)
      expect(derivePasswordKeys(ALICE_PW, ALICE_EMAIL).authHash).toBe(
        derivePasswordKeys(ALICE_PW, " Alice@KMLA.hs.kr ").authHash
      )
      expect(derivePasswordKeys(ALICE_PW, BOB_EMAIL).authHash).not.toBe(alice.authHash)
    },
    TIMEOUT
  )

  it("hands Supabase Auth a hash that stays under bcrypt's 72-byte truncation", () => {
    expect(alice.authHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it(
    "고정 벡터: KDF 파라미터가 조용히 바뀌면 여기서 걸린다",
    async () => {
      // 나머지 테스트는 전부 왕복이라, 누가 ARGON2_PARAMS의 m을 바꾸거나 HKDF info 문자열에
      // 오타를 내도(예: "kmla-auth-v1" -> "kmla-Auth-v1") 알리스와 밥이 매번 **같은 새 코드로**
      // 만들어지고 열리므로 전부 통과한다. 그 사고는 배포 후 기존 계정 전원이 로그인에
      // 실패할 때에야 발견된다.
      //
      // 그래서 값을 못 박는다. 이 테스트가 깨졌다면 둘 중 하나다:
      //   - 실수로 바꿨다 -> 되돌려라.
      //   - 일부러 올렸다 -> 기존 계정을 위한 폴백 경로(새 파라미터 먼저, 실패하면 옛 것)를
      //     먼저 만들고 나서 이 벡터를 갱신하라. 그냥 갱신하면 전 계정이 잠긴다.
      const keys = derivePasswordKeys("고정벡터 비밀번호", "vector@kmla.hs.kr")
      expect(keys.authHash).toBe("7183000b0bdd3689ae84bdaabeedee438cc6d4ea7e773451e4ea61e1da1c1d21")
      expect(bytesToHex(keys.encKey)).toBe(
        "7868700e7563265288f7d892112a21ffe2ebb673ea6a2f630035dd875f0e2542"
      )
    },
    TIMEOUT
  )

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

  it("seals attachments and file names under the same message key", async () => {
    const aliceCrypto = new MessageCrypto(alice.keys)
    const bobCrypto = new MessageCrypto(bob.keys)

    const file = new Uint8Array(4096).map((_, i) => i % 251)
    const sent = await aliceCrypto.encrypt("사진 보냄", recipientsOf(bob))
    const blob = await aliceCrypto.encryptAttachment(file, sent.messageKey, 0)
    const name = await aliceCrypto.encryptFileName("성적표.pdf", sent.messageKey, 0)

    const messageKey = await bobCrypto.unwrapMessageKey(sent.keys[0])
    expect(bytesEqual(await bobCrypto.decryptAttachment(blob, messageKey, 0), file)).toBe(true)
    expect(await bobCrypto.decryptFileName(name, messageKey, 0)).toBe("성적표.pdf")
    // Same key, different nonce: the two blobs must not share a prefix.
    expect(
      bytesEqual(blob.subarray(0, 12), base64ToBytes(sent.contentCiphertext).subarray(0, 12))
    ).toBe(false)
  })

  it("본문·첨부·파일명은 같은 키로 봉인돼도 서로의 자리에 끼워 넣을 수 없다", async () => {
    // 셋 다 같은 messageKey를 쓴다(nonce만 다르다). AAD 라벨이 없으면 셋은 서로에게 완벽히
    // 유효한 봉인이라, DB에 쓸 수 있는 자가 본문 자리에 파일명 암호문을 끼워 넣어도 GCM이
    // 통과시키고 수신자는 에러 없이 엉뚱한 문자열을 본다. 라벨이 각 암호문을 자기 자리에 묶는다.
    const aliceCrypto = new MessageCrypto(alice.keys)
    const bobCrypto = new MessageCrypto(bob.keys)

    const sent = await aliceCrypto.encrypt("진짜 본문", recipientsOf(bob))
    const messageKey = await bobCrypto.unwrapMessageKey(sent.keys[0])
    const fileName = await aliceCrypto.encryptFileName("성적표.pdf", messageKey, 0)
    const attachment = await aliceCrypto.encryptAttachment(new Uint8Array([1, 2, 3]), messageKey, 0)

    // 파일명 암호문을 본문 자리에 끼운다.
    await expect(bobCrypto.decryptContent(fileName, messageKey)).rejects.toBeInstanceOf(
      UndecryptableMessageError
    )
    // 첨부 암호문을 본문 자리에 끼운다.
    await expect(
      bobCrypto.decryptContent(bytesToBase64(attachment), messageKey)
    ).rejects.toBeInstanceOf(UndecryptableMessageError)
    // 본문 암호문을 파일명 자리에 끼운다.
    await expect(
      bobCrypto.decryptFileName(sent.contentCiphertext, messageKey, 0)
    ).rejects.toBeInstanceOf(UndecryptableMessageError)
    // 첨부끼리도 자리를 바꿀 수 없다 -- 라벨에 sort_order가 들어간다.
    await expect(bobCrypto.decryptAttachment(attachment, messageKey, 1)).rejects.toThrow()
  })

  it(
    "makes a rotated account's old messages unreadable and its new ones fine, with no rekeying",
    async () => {
      const bobCrypto = new MessageCrypto(bob.keys)
      const before = await new MessageCrypto(alice.keys).encrypt("갈아엎기 전", recipientsOf(bob))

      // Alice forgets her password. There is no second key by design, so everything is new.
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

describe("seal format", () => {
  it("prefixes a version byte and refuses to open an unknown version", async () => {
    const key = randomBytes(32)
    const sealed = await seal(key, utf8ToBytes("안녕"))

    // 형식은 version(1) || nonce(12) || ciphertext || tag(16). 맨 앞이 버전이라, 나중에 형식을
    // 올려도 open()이 태그를 검증하기 전에 어느 규칙으로 열지 고를 수 있다.
    expect(sealed[0]).toBe(SEAL_VERSION)

    const wrongVersion = sealed.slice()
    wrongVersion[0] = 0x09
    await expect(open(key, wrongVersion)).rejects.toThrow(/unsupported ciphertext version/)

    // 올바른 버전은 왕복한다.
    expect(bytesToUtf8(await open(key, sealed))).toBe("안녕")
  })

  it("봉인 오버헤드는 정확히 29바이트다: version(1) + nonce(12) + tag(16)", async () => {
    // 이 상수가 스키마의 두 크기 상한(send_encrypted_message의 max_bytes+29, message-files-encrypted
    // 버킷의 file_size_limit)의 근거다. 버전 바이트가 붙기 전에는 28이었고, 그 두 곳은 아직 28을
    // 들고 있다가 평문이 정확히 max_bytes인 첨부를 거부했다. 여기가 깨지면 그 두 상한도 같이 틀어진다.
    const key = randomBytes(32)
    for (const size of [0, 1, 256, 4096]) {
      const sealed = await seal(key, new Uint8Array(size))
      expect(sealed.length).toBe(size + 29)
    }
  })

  it("nonce와 tag를 담기에도 짧은 blob은 열지 않는다", async () => {
    // version(1) + nonce(12)보다 짧으면 복호화에 넘길 것이 없다. GCM 태그 에러로 새는 대신
    // 명시적으로 잘렸다고 말한다.
    const key = randomBytes(32)
    await expect(open(key, randomBytes(10))).rejects.toThrow(/truncated/)
  })
})
