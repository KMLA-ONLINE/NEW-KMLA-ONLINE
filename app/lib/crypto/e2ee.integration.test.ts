// @vitest-environment node
//
// 로컬 Supabase를 상대로 프로토콜 전체를 왕복시킨다. crypto.test.ts는 암복호가 스스로
// 맞아떨어지는지를 보고, supabase/tests/05-chat.sql은 스키마 계약을 보지만(가짜 키로, 길이만),
// 둘 중 어느 쪽도 "진짜 키로 봉인한 것이 진짜 DB를 통과해 상대에게 열리는가"를 증명하지
// 않는다. 그건 여기서만 증명된다.
//
// 로컬 인스턴스가 안 떠 있으면 통째로 skip한다 -- Docker 없는 사람의 `npm test`를 깨뜨리지
// 않기 위해서다. 주소와 키는 supabase start의 공개된 데모 값으로 고정한다: 환경변수를 읽으면
// 이 테스트가 언젠가 운영 DB를 향해 발사될 수 있다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { beforeAll, describe, expect, it } from "vitest"

import {
  createAccount,
  resealAccount,
  unlockWithPassword,
  type AccountKeys,
  type NewAccount,
} from "./account"
import { base64ToBytes, bytesEqual, bytesToUtf8, utf8ToBytes } from "./encoding"
import { MessageCrypto, type MessageKeyRow } from "./message"
import { searchDirectMessages } from "./message-search"

const SUPABASE_URL = "http://127.0.0.1:54721"
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

const TIMEOUT = 120_000
const SECRET = "내일 시험 망했어. 아무한테도 말하지 마"

const reachable = await fetch(`${SUPABASE_URL}/rest/v1/`, {
  headers: { apikey: ANON_KEY },
  signal: AbortSignal.timeout(2000),
})
  .then((response) => response.ok)
  .catch(() => false)

if (!reachable) {
  console.warn(`\n[e2ee] ${SUPABASE_URL} 에 연결할 수 없어 통합 테스트를 건너뜁니다.`)
  console.warn("[e2ee] 실행하려면: npx supabase start\n")
}

/** 한 명의 학생. 브라우저가 들고 있는 것과 정확히 같은 것만 들고 있다. */
type User = {
  email: string
  password: string
  db: SupabaseClient
  profileId: number
  authUserId: string
  account: NewAccount
  crypto: MessageCrypto
}

const anonClient = () =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * 가입. 서버로 가는 것은 authHash이지 비밀번호가 아니다 -- 이 함수 전체에서 `password`가
 * Supabase에 닿는 곳은 한 군데도 없다.
 */
async function signUp(name: string): Promise<User> {
  const email = `${name}-${crypto.randomUUID()}@kmla.hs.kr`
  const password = `${name}의 비밀번호 correct-horse`
  const account = await createAccount(password, email)

  const db = anonClient()
  const { data: auth, error } = await db.auth.signUp({ email, password: account.authHash })
  if (error) throw error

  await db.rpc("create_user_keys", {
    p_identity_public_key: account.stored.identity_public_key,
    p_wrapped_user_key: account.stored.wrapped_user_key,
    p_wrapped_identity_secret_key: account.stored.wrapped_identity_secret_key,
  })

  // 승인은 관리자의 일이라 여기서는 service_role로 대신한다. teacher인 이유는 student가
  // 학번·기수를 요구해서일 뿐, E2EE와는 무관하다.
  const { data: profile } = await admin
    .from("profiles")
    .update({ status: "accepted", type: "teacher" })
    .eq("auth_user_id", auth.user!.id)
    .select("id")
    .single()

  return {
    email,
    password,
    db,
    profileId: profile!.id,
    authUserId: auth.user!.id,
    account,
    crypto: new MessageCrypto(account.keys),
  }
}

async function peerPublicKey(user: User, peer: User): Promise<Uint8Array> {
  const { data, error } = await user.db.rpc("get_identity_public_keys", {
    p_user_ids: [peer.profileId],
  })
  if (error) throw error
  expect(data).toHaveLength(1)
  return base64ToBytes(data[0].identity_public_key)
}

type ChatRow = {
  message_id: number
  content: string | null
  content_ciphertext: string | null
  message_key: MessageKeyRow | null
}

async function readMessages(user: User, conversationId: number): Promise<ChatRow[]> {
  const { data, error } = await user.db.rpc("get_chat_messages", {
    p_conversation_id: conversationId,
  })
  if (error) throw error
  return data as ChatRow[]
}

async function send(from: User, to: User, conversationId: number, text: string) {
  const sealed = await from.crypto.encrypt(text, [
    { userId: to.profileId, publicKey: await peerPublicKey(from, to) },
  ])
  const { data, error } = await from.db.rpc("send_encrypted_message", {
    p_conversation_id: conversationId,
    p_content_ciphertext: sealed.contentCiphertext,
    p_keys: sealed.keys,
  })
  if (error) throw error
  return data as number
}

describe.skipIf(!reachable)("종단간 암호화: 실제 DB 왕복", () => {
  let alice: User
  let bob: User
  let conversationId: number
  let messageId: number

  beforeAll(async () => {
    ;[alice, bob] = await Promise.all([signUp("alice"), signUp("bob")])

    const { data, error } = await alice.db.rpc("create_direct_conversation", {
      p_peer_id: bob.profileId,
    })
    if (error) throw error
    conversationId = data as number
    messageId = await send(alice, bob, conversationId, SECRET)
  }, TIMEOUT)

  it("수신자가 읽는다", async () => {
    const [message] = await readMessages(bob, conversationId)
    expect(message.message_id).toBe(messageId)
    expect(message.content).toBeNull()
    expect(await bob.crypto.decrypt(message.content_ciphertext!, message.message_key!)).toBe(SECRET)
  })

  it("발신자도 자기가 보낸 것을 다시 읽는다 -- 자기 사본 없이", async () => {
    const [message] = await readMessages(alice, conversationId)
    expect(await alice.crypto.decrypt(message.content_ciphertext!, message.message_key!)).toBe(
      SECRET
    )

    // 봉투는 수신자 앞으로 한 행뿐이다. 발신자는 DH 대칭성으로 그 행을 그대로 연다.
    const { count } = await admin
      .from("message_keys")
      .select("*", { count: "exact", head: true })
      .eq("message_id", messageId)
    expect(count).toBe(1)
  })

  it("서버는 못 읽는다 -- service_role로 DB를 통째로 열어도", async () => {
    // 운영자가 가질 수 있는 최대치: RLS를 우회하는 service_role로 모든 테이블을 본다.
    const { data: message } = await admin
      .from("messages")
      .select("content, content_ciphertext")
      .eq("id", messageId)
      .single()
    const { data: vault } = await admin
      .from("user_keys")
      .select("wrapped_user_key, wrapped_identity_secret_key")
      .eq("user_id", alice.profileId)
      .single()
    const { data: envelope } = await admin
      .from("message_keys")
      .select("wrapped_key")
      .eq("message_id", messageId)
      .single()

    expect(message!.content).toBeNull()

    // DB가 들고 있는 모든 바이트를 이어붙여도 평문은 그 안에 없다. 열쇠는 비밀번호에서
    // 나오고, 비밀번호는 여기 온 적이 없다.
    const everythingTheServerHas = [
      message!.content_ciphertext,
      vault!.wrapped_user_key,
      vault!.wrapped_identity_secret_key,
      envelope!.wrapped_key,
    ].join("")
    for (const bytes of [utf8ToBytes(SECRET), utf8ToBytes(alice.password)]) {
      expect(everythingTheServerHas).not.toContain(bytesToUtf8(bytes))
      expect(everythingTheServerHas).not.toContain(Buffer.from(bytes).toString("hex"))
    }
  })

  it(
    "비밀번호를 바꿔도 옛 대화가 그대로 열린다",
    async () => {
      const NEW_PASSWORD = "완전히 새로운 비밀번호"
      const resealed = await resealAccount(alice.account.keys, NEW_PASSWORD, alice.email)

      // 브라우저가 하는 그대로: Supabase Auth의 비밀번호(=authHash)와 금고를 같이 바꾼다.
      await alice.db.auth.updateUser({ password: resealed.authHash })
      const { error } = await alice.db.rpc("reseal_user_keys", {
        p_wrapped_user_key: resealed.stored.wrapped_user_key,
      })
      expect(error).toBeNull()

      // 새 비밀번호로 처음부터 로그인한다.
      const fresh = anonClient()
      const { error: loginError } = await fresh.auth.signInWithPassword({
        email: alice.email,
        password: resealed.authHash,
      })
      expect(loginError).toBeNull()

      const { data: vault } = await fresh.rpc("get_my_key_vault")
      const reopened: AccountKeys = (await unlockWithPassword(NEW_PASSWORD, alice.email, vault[0]))
        .keys

      // 이 단언이 userKey를 한 겹 끼운 이유의 전부다: 신원키가 그대로라서 메시지를 한 통도
      // 재암호화하지 않았는데도 히스토리가 살아 있다.
      const { data: rows } = await fresh.rpc("get_chat_messages", {
        p_conversation_id: conversationId,
      })
      const message = (rows as ChatRow[])[0]
      expect(
        await new MessageCrypto(reopened).decrypt(message.content_ciphertext!, message.message_key!)
      ).toBe(SECRET)
    },
    TIMEOUT
  )

  it("1:1에 평문을 밀어 넣을 수 없다", async () => {
    const { error } = await alice.db
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: alice.profileId, content: "평문" })
    expect(error).not.toBeNull()
  })

  it("서버는 1:1을 검색해 주지 않는다 -- 0건이 아니라 거절한다", async () => {
    const { error } = await alice.db.rpc("search_messages", {
      p_query: "시험",
      p_conversation_id: conversationId,
    })
    expect(error?.message).toMatch(/end-to-end encrypted/)
  })

  // 아래 두 테스트는 마지막에 둔다: 검색 테스트가 메시지를 더 보내므로 "마지막 메시지"가
  // 바뀐다. 미리보기 테스트가 그 뒤로 가면 SECRET이 아니라 새 메시지를 보게 된다.
  it("대화 목록의 미리보기도 암호문으로 온다 -- 서버가 만들 수 없으므로", async () => {
    const { data } = await bob.db.rpc("list_conversations")
    const room = (
      data as {
        conversation_id: number
        last_message_content: string | null
        last_message_content_ciphertext: string | null
        last_message_key: MessageKeyRow | null
      }[]
    ).find((r) => r.conversation_id === conversationId)!

    expect(room.last_message_content).toBeNull()
    expect(
      await bob.crypto.decrypt(room.last_message_content_ciphertext!, room.last_message_key!)
    ).toBe(SECRET)
  })

  it(
    "서버가 못 하는 1:1 검색을 클라이언트가 대신 한다 -- 그룹 검색과 똑같은 규칙으로",
    async () => {
      await send(alice, bob, conversationId, "수학 숙제 다 했어?")
      await send(bob, alice, conversationId, "아직. 내일 아침에 할래")

      // 서버의 그룹 검색과 같은 정규화(소문자화 + 공백 전부 제거 + 부분 문자열)라서,
      // 붙여 친 "수학숙제"가 띄어 쓴 "수학 숙제"를 찾는다. 사용자가 지금 어느 쪽 대화에
      // 있는지를 검색 결과로 눈치채면 안 된다.
      const found = await searchDirectMessages(bob.db, bob.crypto, conversationId, "수학숙제")
      expect(found.matches.map((match) => match.content)).toEqual(["수학 숙제 다 했어?"])
      expect(found.reachedStart).toBe(true)

      // 질의 쪽 공백도 무시된다.
      const spaced = await searchDirectMessages(bob.db, bob.crypto, conversationId, "  내 일  ")
      expect(spaced.matches.length).toBeGreaterThan(0)

      const nothing = await searchDirectMessages(
        bob.db,
        bob.crypto,
        conversationId,
        "존재하지않는말"
      )
      expect(nothing.matches).toHaveLength(0)
      expect(nothing.scanned).toBeGreaterThan(0) // 훑기는 훑었다

      // 발신자도 자기가 보낸 것을 찾는다. 봉투는 수신자 앞으로만 있지만 DH가 대칭이라
      // 발신자가 그 행을 그대로 연다 -- 그 성질이 검색 경로에서도 성립해야 한다.
      const bySender = await searchDirectMessages(
        alice.db,
        alice.crypto,
        conversationId,
        "수학숙제"
      )
      expect(bySender.matches.map((match) => match.content)).toEqual(["수학 숙제 다 했어?"])
    },
    TIMEOUT
  )

  it("검색이 조용히 자르지 않는다 -- 끝까지 못 갔으면 그렇게 말한다", async () => {
    // scanLimit에 걸려 멈추면 reachedStart가 false여야 한다. 여기서 true를 주면 UI가
    // "그런 메시지 없습니다"라고 말하게 되고, 그건 거짓말이다.
    const capped = await searchDirectMessages(bob.db, bob.crypto, conversationId, "숙제", {
      scanLimit: 1,
    })
    expect(capped.reachedStart).toBe(false)
  })

  // 맨 끝에 둔다: 이 테스트는 첨부 달린 새 메시지를 보내 "마지막 메시지"를 바꾼다. 미리보기
  // 테스트 앞으로 가면 그쪽이 SECRET이 아니라 이 메시지를 보게 된다.
  it(
    "암호화 첨부가 storage를 왕복한다 -- 업로드·봉투·다운로드·복호까지",
    async () => {
      // content_type은 message_attachment_mime_types에 있어야 send RPC의 FK 조인을 통과한다.
      // 시드에서 하나 집어와, 시드가 바뀌어도 테스트가 임의로 깨지지 않게 한다.
      const { data: mimeRows, error: mimeError } = await alice.db
        .from("message_attachment_mime_types")
        .select("content_type")
        .limit(1)
      if (mimeError) throw mimeError
      const contentType = mimeRows![0].content_type

      const fileBytes = new Uint8Array(256).map((_, i) => (i * 7) % 251)
      const fileName = "성적표.pdf"

      // 발신자가 메시지 키를 만들고(본문도 같이), 그 키로 첨부와 파일명을 봉인한다. 첨부는 본문과
      // 같은 messageKey를 타되 sort_order가 든 라벨로 자기 자리에 묶인다.
      const sent = await alice.crypto.encrypt("이거 확인해줘", [
        { userId: bob.profileId, publicKey: await peerPublicKey(alice, bob) },
      ])
      const sealedFile = await alice.crypto.encryptAttachment(fileBytes, sent.messageKey, 0)
      const sealedName = await alice.crypto.encryptFileName(fileName, sent.messageKey, 0)

      // 봉인된 blob = 평문 + 29(version 1 + nonce 12 + tag 16). 이게 storage에 앉는 바이트 수이자
      // size_bytes이고, send RPC가 max_bytes+29와 비교하는 값이다.
      expect(sealedFile.length).toBe(fileBytes.length + 29)

      // 경로는 <conversation_id>/<내 auth uid>/<uuid>. 버킷 정책이 두 번째 세그먼트가 내 uid인지,
      // 대화가 direct라 버킷이 message-files-encrypted인지까지 본다.
      const path = `${conversationId}/${alice.authUserId}/${crypto.randomUUID()}`
      const { error: uploadError } = await alice.db.storage
        .from("message-files-encrypted")
        .upload(path, sealedFile, { contentType: "application/octet-stream" })
      expect(uploadError).toBeNull()

      const { data: messageId, error: sendError } = await alice.db.rpc("send_encrypted_message", {
        p_conversation_id: conversationId,
        p_content_ciphertext: sent.contentCiphertext,
        p_keys: sent.keys,
        p_attachments: [
          {
            storage_path: path,
            file_name_ciphertext: sealedName,
            content_type: contentType,
            size_bytes: sealedFile.length,
          },
        ],
      })
      if (sendError) throw sendError

      // 수신자가 봉투와 첨부 메타데이터를 받는다. 파일 바이트는 여기 없다 -- storage에서 따로 받는다.
      const { data: rows } = await bob.db.rpc("get_chat_messages", {
        p_conversation_id: conversationId,
      })
      const row = (
        rows as {
          message_id: number
          message_key: MessageKeyRow | null
          attachments: {
            storage_bucket: string
            storage_path: string
            content_type: string
            file_name: string | null
            file_name_ciphertext: string
          }[]
        }[]
      ).find((r) => r.message_id === messageId)!
      expect(row.attachments).toHaveLength(1)
      const att = row.attachments[0]
      expect(att.storage_bucket).toBe("message-files-encrypted")
      expect(att.content_type).toBe(contentType)
      // 파일명은 평문으로 오지 않는다 -- 암호문 컬럼만 채워진다.
      expect(att.file_name).toBeNull()

      // 수신자가 storage에서 암호문 blob을 받아 메시지 키로 푼다.
      const { data: blob, error: downloadError } = await bob.db.storage
        .from("message-files-encrypted")
        .download(att.storage_path)
      expect(downloadError).toBeNull()
      const downloaded = new Uint8Array(await blob!.arrayBuffer())

      const messageKey = await bob.crypto.unwrapMessageKey(row.message_key!)
      expect(
        bytesEqual(await bob.crypto.decryptAttachment(downloaded, messageKey, 0), fileBytes)
      ).toBe(true)
      expect(await bob.crypto.decryptFileName(att.file_name_ciphertext, messageKey, 0)).toBe(
        fileName
      )
    },
    TIMEOUT
  )
})
