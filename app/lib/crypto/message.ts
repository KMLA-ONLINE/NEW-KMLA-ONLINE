/**
 * Message encryption.
 *
 * Each message gets its own random key. The body and every attachment on that
 * message are sealed under it, and the key itself is sealed once per recipient
 * against a Diffie-Hellman between the two identity keys:
 *
 *     messageKey = random 32B
 *     content    = seal(messageKey, plaintext)
 *     attachment = seal(messageKey, filebytes)          -- different nonce, same key
 *     wrapKey    = HKDF(DH(sender_secret, recipient_public))
 *     wrapped    = seal(wrapKey, messageKey)            -- one row in message_keys
 *
 * Two consequences worth being explicit about.
 *
 * The DH is symmetric, so the sender computes the same `wrapKey` the recipient
 * does. One wrapped row per recipient is therefore enough: the sender opens it
 * too, and no separate copy-for-myself is stored. In a direct chat that is exactly
 * one row per message.
 *
 * Both public keys are recorded on the row. That is what makes key rotation free.
 * If a user resets their password, their identity key is replaced and every row
 * sealed to the old one stops opening -- and says so,
 * because the public key on the row no longer matches theirs. New messages are
 * sealed to the new key and just work. No epochs, no rekeying handshake, no
 * coordination between the two clients at all.
 */
import { base64ToBytes, bytesEqual, bytesToBase64, bytesToUtf8, utf8ToBytes } from "./encoding"
import { KEY_BYTES, deriveSubkey, open, randomBytes, seal, sharedSecret } from "./primitives"
import type { AccountKeys } from "./account"

/** Mirrors public.message_keys. Every key field is base64 of a `bytea`. */
export type MessageKeyRow = {
  wrapped_key: string
  sender_public_key: string
  recipient_public_key: string
}

/**
 * AAD 라벨. 한 메시지의 본문·첨부·파일명은 전부 같은 messageKey로 봉인되므로, 라벨이 없으면
 * 셋이 서로에게 완벽히 유효한 봉인이 된다 -- DB에 쓸 수 있는 자가 본문 자리에 파일명 암호문을
 * 끼워 넣어도 GCM이 통과시킨다. 라벨이 각 암호문을 자기 자리에 묶는다(./primitives.ts).
 *
 * 첨부는 sort_order까지 라벨에 넣어, 같은 메시지의 첨부끼리도 자리를 바꿀 수 없게 한다.
 */
const BODY = "kmla-body-v1"
const ENVELOPE = "kmla-envelope-v1"
const attachmentLabel = (index: number) => `kmla-file-v1:${index}`
const fileNameLabel = (index: number) => `kmla-filename-v1:${index}`

export type Recipient = { userId: number; publicKey: Uint8Array }

export type EncryptedMessage = {
  /** base64; goes to send_encrypted_message(p_content_ciphertext). */
  contentCiphertext: string
  /** base64; goes to send_encrypted_message(p_keys), one element per recipient. */
  keys: (MessageKeyRow & { user_id: number })[]
  /** Kept by the caller only long enough to seal the attachments. */
  messageKey: Uint8Array
}

/**
 * Thrown when the row was sealed to an identity key this account no longer holds
 * -- the other side of a password reset that rotated the identity key. It is a permanent
 * state, not a transient failure, and the UI renders it as such rather than
 * retrying.
 */
export class UndecryptableMessageError extends Error {
  constructor() {
    super("이 메시지는 복호화할 수 없습니다.")
    this.name = "UndecryptableMessageError"
  }
}

/**
 * Bound to one unlocked account and thrown away with it. The cache is the reason
 * this design is affordable: X25519 costs ~2ms, which is nothing once per
 * conversation and 2 seconds across a thousand-message scrollback.
 */
export class MessageCrypto {
  private readonly wrapKeys = new Map<string, Uint8Array>()

  constructor(private readonly account: AccountKeys) {}

  private wrapKeyFor(peerPublicKey: Uint8Array): Uint8Array {
    const cacheKey = bytesToBase64(peerPublicKey)
    let wrapKey = this.wrapKeys.get(cacheKey)
    if (!wrapKey) {
      wrapKey = deriveSubkey(
        sharedSecret(this.account.identity.secretKey, peerPublicKey),
        "kmla-msgkey-v1"
      )
      this.wrapKeys.set(cacheKey, wrapKey)
    }
    return wrapKey
  }

  /**
   * `recipients` excludes the sender: the row addressed to the peer is the row the
   * sender reads back. A direct chat therefore passes exactly one recipient.
   */
  async encrypt(plaintext: string, recipients: Recipient[]): Promise<EncryptedMessage> {
    if (recipients.length === 0) throw new Error("message needs at least one recipient")

    const messageKey = randomBytes(KEY_BYTES)
    const senderPublicKey = bytesToBase64(this.account.identity.publicKey)

    return {
      messageKey,
      contentCiphertext: bytesToBase64(await seal(messageKey, utf8ToBytes(plaintext), BODY)),
      keys: await Promise.all(
        recipients.map(async (recipient) => ({
          user_id: recipient.userId,
          sender_public_key: senderPublicKey,
          recipient_public_key: bytesToBase64(recipient.publicKey),
          wrapped_key: bytesToBase64(
            await seal(this.wrapKeyFor(recipient.publicKey), messageKey, ENVELOPE)
          ),
        }))
      ),
    }
  }

  /**
   * The row names both ends of the DH, so whichever one is not us is the peer to
   * agree with. If neither is us, our identity key has been replaced since the
   * message was sent and nothing can open it.
   */
  async unwrapMessageKey(row: MessageKeyRow): Promise<Uint8Array> {
    const mine = this.account.identity.publicKey
    const sender = base64ToBytes(row.sender_public_key)
    const recipient = base64ToBytes(row.recipient_public_key)

    let peer: Uint8Array
    if (bytesEqual(recipient, mine)) peer = sender
    else if (bytesEqual(sender, mine)) peer = recipient
    else throw new UndecryptableMessageError()

    try {
      return await open(this.wrapKeyFor(peer), base64ToBytes(row.wrapped_key), ENVELOPE)
    } catch {
      throw new UndecryptableMessageError()
    }
  }

  /**
   * 실패하면 언제나 UndecryptableMessageError다. 손상된 행이나 label이 어긋난 blob 하나가
   * 원시 예외로 새어 나가면, 그걸 부르는 쪽(검색, 목록 렌더)이 그 하나 때문에 통째로 죽는다.
   */
  async decryptContent(contentCiphertext: string, messageKey: Uint8Array): Promise<string> {
    try {
      return bytesToUtf8(await open(messageKey, base64ToBytes(contentCiphertext), BODY))
    } catch {
      throw new UndecryptableMessageError()
    }
  }

  /** Convenience for the common case of a body with no attachments. */
  async decrypt(contentCiphertext: string, row: MessageKeyRow): Promise<string> {
    return this.decryptContent(contentCiphertext, await this.unwrapMessageKey(row))
  }

  /**
   * 첨부는 메시지 키를 같이 탄다. 올라간 객체는 불투명한 바이트라 storage도 send RPC도 그
   * MIME을 검증할 수 없다 -- message_attachments.content_type은 발신자가 신고한 값이고,
   * 화이트리스트와 대조는 되지만 파일 자체와 대조되지는 않는다. 복호화한 blob을 브라우저에
   * 넘길 때 반드시 그 신고된 타입을 써야 하는 이유이고, 그 문은 ./attachment.ts 하나다.
   *
   * `index`(= message_attachments.sort_order)가 AAD에 들어가므로 **같은 메시지의 첨부끼리도
   * 자리를 바꿔치기할 수 없다.**
   */
  async encryptAttachment(
    bytes: Uint8Array,
    messageKey: Uint8Array,
    index: number
  ): Promise<Uint8Array> {
    return seal(messageKey, bytes, attachmentLabel(index))
  }

  async decryptAttachment(
    bytes: Uint8Array,
    messageKey: Uint8Array,
    index: number
  ): Promise<Uint8Array> {
    return open(messageKey, bytes, attachmentLabel(index))
  }

  /**
   * 파일명도 내용이다 -- "성적표.pdf"를 평문으로 남기면 본문만 암호화한 것이 반쪽이 된다.
   * message_attachments.file_name_ciphertext로 간다(base64).
   */
  async encryptFileName(name: string, messageKey: Uint8Array, index: number): Promise<string> {
    return bytesToBase64(await seal(messageKey, utf8ToBytes(name), fileNameLabel(index)))
  }

  async decryptFileName(
    ciphertextBase64: string,
    messageKey: Uint8Array,
    index: number
  ): Promise<string> {
    try {
      return bytesToUtf8(
        await open(messageKey, base64ToBytes(ciphertextBase64), fileNameLabel(index))
      )
    } catch {
      throw new UndecryptableMessageError()
    }
  }
}
