/**
 * 1:1 대화 검색.
 *
 * 서버는 암호문을 열 수 없으므로 클라이언트가 통째로 받아 스스로 푸는 것 말고 방법이 없다.
 * 이건 이 앱의 타협이 아니라 종단간 암호화 메신저가 전부 하는 일이다 -- Signal도 WhatsApp도
 * iMessage도 로컬에서 찾는다. (검색 가능 암호화는 토큰 빈도를 흘리는데, 짧은 메시지의 trigram
 * 빈도는 사실상 평문이라 지키려던 것을 그대로 내주게 된다.)
 *
 * 매칭 규칙은 서버의 그룹 검색(`public.search_messages`)과 **똑같다**: 소문자화, 공백 전부
 * 제거, 부분 문자열. 사용자가 지금 어느 쪽 대화에 있는지를 검색 결과로 눈치채면 안 된다.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "~/lib/supabase/database.types"
import { MessageCrypto, UndecryptableMessageError, type MessageKeyRow } from "./message"

/** 서버의 `regexp_replace(lower(x), '\s+', '', 'g')`와 같은 정규화. */
export function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "")
}

export type DirectMessageMatch = {
  messageId: number
  senderId: number
  createdAt: string
  content: string
}

export type DirectMessageSearchResult = {
  matches: DirectMessageMatch[]
  /** 실제로 열어본 메시지 수. */
  scanned: number
  /**
   * 대화의 처음까지 다 훑었는가. false면 **더 오래된 곳에 결과가 더 있을 수 있다** --
   * UI는 이걸 그대로 말해야 한다. 조용히 자르면 "그런 메시지 없네"로 읽힌다.
   */
  reachedStart: boolean
}

type Row = {
  message_id: number
  sender_id: number
  created_at: string
  content_ciphertext: string | null
  message_key: MessageKeyRow | null
}

/** RPC 한 번에 받는 수. PostgREST의 max_rows가 1000이라 그 위는 어차피 잘린다. */
const PAGE = 500

export type SearchOptions = {
  /** 결과 상한. 서버의 그룹 검색이 50에서 끊으므로 기본값을 맞춘다. */
  limit?: number
  /**
   * 훑을 메시지 수의 상한. 몇 년치 대화를 매 검색마다 전부 내려받지 않기 위한 천장이고,
   * 여기서 멈추면 `reachedStart: false`로 정직하게 알린다.
   */
  scanLimit?: number
}

export async function searchDirectMessages(
  db: SupabaseClient<Database>,
  crypto: MessageCrypto,
  conversationId: number,
  query: string,
  { limit = 50, scanLimit = 5000 }: SearchOptions = {}
): Promise<DirectMessageSearchResult> {
  const needle = normalizeSearchText(query.trim())
  if (needle === "") return { matches: [], scanned: 0, reachedStart: true }

  const matches: DirectMessageMatch[] = []
  // 첫 페이지는 커서를 아예 넘기지 않는다 -- RPC의 기본값(null)이 "가장 최근부터"다.
  let before: number | undefined
  let scanned = 0

  for (;;) {
    // scanLimit을 넘겨 받지 않는다. 100개만 훑기로 했는데 500개를 내려받으면 상한을 둔
    // 의미가 없고, 페이지 경계에서만 세면 scanLimit이 사실상 PAGE 단위로 반올림된다.
    const pageSize = Math.min(PAGE, scanLimit - scanned)
    if (pageSize <= 0) return { matches, scanned, reachedStart: false }

    const { data, error } = await db.rpc("get_encrypted_message_bodies", {
      p_conversation_id: conversationId,
      p_before_id: before,
      p_limit: pageSize,
    })
    if (error) throw error
    const rows = (data ?? []) as Row[]

    for (const row of rows) {
      scanned++
      if (!row.content_ciphertext || !row.message_key) continue

      let content: string
      try {
        content = await crypto.decrypt(row.content_ciphertext, row.message_key)
      } catch (caught) {
        // 키를 갈아엎기 전의 옛 메시지는 이 계정으로 영영 안 열린다. 검색에서는 그냥
        // 존재하지 않는 것으로 다룬다 -- 던지면 그 하나 때문에 검색 전체가 죽는다.
        if (caught instanceof UndecryptableMessageError) continue
        throw caught
      }

      if (normalizeSearchText(content).includes(needle)) {
        matches.push({
          messageId: row.message_id,
          senderId: row.sender_id,
          createdAt: row.created_at,
          content,
        })
        // 더 오래된 곳에 결과가 더 있을 수 있다. 여기서 reachedStart를 true라고 하면
        // UI가 "이게 전부입니다"라고 말하게 된다.
        if (matches.length >= limit) return { matches, scanned, reachedStart: false }
      }
    }

    // 요청한 것보다 적게 왔다 = 대화의 처음까지 왔다.
    if (rows.length < pageSize) return { matches, scanned, reachedStart: true }

    before = rows[rows.length - 1].message_id
  }
}
