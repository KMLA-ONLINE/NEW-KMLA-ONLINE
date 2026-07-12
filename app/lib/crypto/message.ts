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
 * If a user resets their password with no recovery code, their identity key is
 * replaced and every row sealed to the old one stops opening -- and says so,
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
 * -- the other side of a password reset without a recovery code. It is a permanent
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
      contentCiphertext: bytesToBase64(await seal(messageKey, utf8ToBytes(plaintext))),
      keys: await Promise.all(
        recipients.map(async (recipient) => ({
          user_id: recipient.userId,
          sender_public_key: senderPublicKey,
          recipient_public_key: bytesToBase64(recipient.publicKey),
          wrapped_key: bytesToBase64(await seal(this.wrapKeyFor(recipient.publicKey), messageKey)),
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
      return await open(this.wrapKeyFor(peer), base64ToBytes(row.wrapped_key))
    } catch {
      throw new UndecryptableMessageError()
    }
  }

  async decryptContent(contentCiphertext: string, messageKey: Uint8Array): Promise<string> {
    return bytesToUtf8(await open(messageKey, base64ToBytes(contentCiphertext)))
  }

  /** Convenience for the common case of a body with no attachments. */
  async decrypt(contentCiphertext: string, row: MessageKeyRow): Promise<string> {
    return this.decryptContent(contentCiphertext, await this.unwrapMessageKey(row))
  }

  /**
   * Attachments ride the message key. The uploaded object is opaque bytes, so
   * storage cannot police its MIME type and neither can the send RPC -- the
   * declared `content_type` on message_attachments is the sender's word, checked
   * against the allowlist but not against the file. A decrypted blob must
   * therefore only ever be handed to a renderer chosen from that declared type,
   * and never navigated to: see docs/e2ee.md.
   */
  async encryptAttachment(bytes: Uint8Array, messageKey: Uint8Array): Promise<Uint8Array> {
    return seal(messageKey, bytes)
  }

  async decryptAttachment(bytes: Uint8Array, messageKey: Uint8Array): Promise<Uint8Array> {
    return open(messageKey, bytes)
  }
}
