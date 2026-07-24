import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import type { Database } from "~/lib/supabase/database.types"
import type { MessageCrypto, MessageKeyRow } from "./message"
import {
  DirectMessageSearchIndex,
  normalizeSearchText,
  searchDirectMessages,
} from "./message-search"

const KEY: MessageKeyRow = {
  wrapped_key: "wrapped",
  sender_public_key: "sender",
  recipient_public_key: "recipient",
}

describe("direct message search", () => {
  it("uses the same NFC, lowercase and whitespace normalization as Postgres", () => {
    const decomposed = "한글 테스트"
    expect(normalizeSearchText(decomposed)).toBe(normalizeSearchText("한글테스트"))
  })

  it("indexes trigrams in memory and applies edits and deletes incrementally", () => {
    const index = new DirectMessageSearchIndex()
    index.upsert({ messageId: 1, senderId: 10, createdAt: "2026-01-01", content: "수학 숙제" })
    index.upsert({ messageId: 2, senderId: 20, createdAt: "2026-01-02", content: "영어 숙제" })
    index.markComplete()

    expect(index.search("수학숙제").matches.map((message) => message.messageId)).toEqual([1])
    expect(index.search("숙제").matches.map((message) => message.messageId)).toEqual([2, 1])

    index.upsert({ messageId: 1, senderId: 10, createdAt: "2026-01-01", content: "수학 완료" })
    index.remove(2)
    expect(index.search("숙제").matches).toHaveLength(0)
    expect(index.search("완료").matches.map((message) => message.messageId)).toEqual([1])
  })

  it("reuses a completed scan without another backend request", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          message_id: 7,
          sender_id: 10,
          created_at: "2026-01-01T00:00:00Z",
          content_ciphertext: "한글 검색",
          message_key: KEY,
        },
      ],
      error: null,
    })
    const db = { rpc } as unknown as SupabaseClient<Database>
    const crypto = {
      decrypt: vi.fn(async (ciphertext: string) => ciphertext),
    } as unknown as MessageCrypto
    const index = new DirectMessageSearchIndex()

    const first = await searchDirectMessages(db, crypto, 1, "한글검색", { index })
    expect(first.matches.map((message) => message.messageId)).toEqual([7])
    expect(first.reachedStart).toBe(true)
    expect(index.isComplete).toBe(true)

    const second = await searchDirectMessages(db, crypto, 1, "한글", { index })
    expect(second.matches.map((message) => message.messageId)).toEqual([7])
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
