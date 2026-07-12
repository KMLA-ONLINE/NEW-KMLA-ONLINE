/**
 * 세션이 들고 있는 열쇠. 브라우저 전용이다 -- 서버는 이 파일의 어떤 값도 본 적이 없다.
 *
 * 새로고침하면 메모리의 키가 사라지는데, 비밀번호는 이미 없다(그게 요점이다). 그래서
 * `encKey`를 IndexedDB에 **추출 불가능한 CryptoKey**로 남긴다:
 *
 *   - 새로고침해도 로그인 상태가 유지된다. 매번 비밀번호를 다시 묻는 것은 학교 채팅 앱에서
 *     쓸 수 없는 UX다.
 *   - 추출 불가능하므로 XSS가 그 키를 **복사해 나갈 수는 없다.** 물론 페이지 안에서 *쓸* 수는
 *     있으니 XSS는 여전히 치명적이다 -- 다만 그 경우 공격자는 어차피 비밀번호를 키로깅할 수
 *     있으므로, 이 선택으로 잃는 것은 없고 얻는 것만 있다.
 *   - IndexedDB에서 나가는 것이 없으므로 디스크만 훔친 사람은 아무것도 얻지 못한다.
 *
 * userKey와 신원 비밀키는 **절대 저장하지 않는다.** 매 로드마다 서버의 봉인된 blob을 받아
 * encKey로 풀어 메모리에만 둔다. 즉 디스크에 남는 평문 키가 하나도 없다.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "~/lib/supabase/database.types"
import {
  WrongPasswordError,
  createAccount,
  resealAccount,
  rotateAccount,
  unlockWithEncKey,
  unlockWithPassword,
  unlockWithRecoveryCode,
  type AccountKeys,
  type NewAccount,
  type StoredUserKeys,
} from "./account"
import { MessageCrypto } from "./message"
import { importUnextractableKey } from "./primitives"

type Client = SupabaseClient<Database>

const DB_NAME = "kmla-vault"
const STORE = "keys"
const DB_VERSION = 1

/**
 * 살아 있는 세션. 클라이언트 사이드 네비게이션 사이에 살아남되(모듈 스코프), 새로고침에는
 * 살아남지 않는다 -- 그때는 IndexedDB의 encKey로 다시 연다.
 */
let unlocked: { authUserId: string; keys: AccountKeys; crypto: MessageCrypto } | null = null

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
  )
}

/**
 * IndexedDB는 실패할 수 있다 -- iOS Safari의 프라이빗 모드처럼 아예 막아 두는 환경이 있다.
 *
 * 그 실패가 가입이나 로그인을 깨뜨리면 안 된다. **기기에 열쇠를 기억시키는 것은 편의이지
 * 정확성이 아니다.** 저장이 안 되면 세션은 메모리로 멀쩡히 돌아가고, 새로고침했을 때만 금고가
 * 잠긴 채로 뜬다(= 비밀번호를 다시 묻는다). 그래서 여기서는 삼키고, 부르는 쪽은 성공을
 * 가정하지 않는다.
 */
async function persist<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work()
  } catch {
    return null
  }
}

/**
 * CryptoKey는 구조화 복제가 되는 객체라 IndexedDB에 그대로 들어간다. 추출 불가능 플래그도
 * 함께 보존되어, 다시 꺼내도 여전히 raw 바이트를 뽑을 수 없다.
 *
 * auth user id로 슬롯을 잡는 이유: 같은 기기를 다른 계정이 쓸 때(학교 공용 컴퓨터), 남의
 * encKey로 내 금고를 열려다 조용히 실패하는 대신 애초에 다른 슬롯을 보게 된다.
 */
async function rememberEncKey(authUserId: string, encKey: Uint8Array) {
  await persist(async () => {
    const key = await importUnextractableKey(encKey)
    return withStore("readwrite", (store) => store.put(key, authUserId))
  })
}

async function recallEncKey(authUserId: string): Promise<CryptoKey | null> {
  return persist(() =>
    withStore<CryptoKey | undefined>("readonly", (store) => store.get(authUserId))
  ).then((stored) => stored ?? null)
}

async function forgetEncKey(authUserId?: string) {
  await persist(() =>
    withStore("readwrite", (store) => (authUserId ? store.delete(authUserId) : store.clear()))
  )
}

async function fetchStoredKeys(db: Client): Promise<StoredUserKeys | null> {
  const { data, error } = await db.rpc("get_my_key_vault")
  if (error) throw error
  return (data as StoredUserKeys[])[0] ?? null
}

async function writeStoredKeys(db: Client, stored: StoredUserKeys) {
  const { error } = await db.rpc("create_user_keys", {
    p_identity_public_key: stored.identity_public_key,
    p_wrapped_user_key: stored.wrapped_user_key,
    p_wrapped_identity_secret_key: stored.wrapped_identity_secret_key,
    p_recovery_wrapped_user_key: stored.recovery_wrapped_user_key,
  })
  if (error) throw error
}

function hold(authUserId: string, keys: AccountKeys) {
  unlocked = { authUserId, keys, crypto: new MessageCrypto(keys) }
  return unlocked
}

/**
 * 이미 만들어 둔 계정 키를 서버에 심고 이 기기에 붙든다.
 *
 * createVault와 나눠 둔 이유는 순전히 비용이다: 가입 화면은 Supabase Auth에 보낼 authHash를
 * 얻으려고 이미 createAccount를 한 번 불렀는데, 여기서 또 부르면 Argon2id가 두 번 돌아
 * 로그인 화면이 1초씩 멈춘다.
 */
export async function installVault(db: Client, authUserId: string, account: NewAccount) {
  await writeStoredKeys(db, account.stored)
  await rememberEncKey(authUserId, account.encKey)
  hold(authUserId, account.keys)
}

/**
 * 가입. 열쇠고리를 만들고, 복구 코드를 딱 한 번 돌려준다 -- 서버에도 여기에도 그 코드를
 * 되살릴 방법은 없다.
 */
export async function createVault(db: Client, authUserId: string, password: string, email: string) {
  const account = await createAccount(password, email)
  await installVault(db, authUserId, account)
  return { recoveryCode: account.recoveryCode }
}

/**
 * 로그인. `authHash`는 이미 Supabase Auth에 쓰였고, 여기서는 같은 비밀번호로 금고를 연다.
 *
 * 열쇠고리가 없으면 만든다. 열쇠고리 없이 존재하는 계정은 두 경우다: 가입 도중 죽었거나,
 * E2EE 이전에 만들어졌거나. 어느 쪽이든 잃을 히스토리가 없다 -- 그리고 열쇠고리가 *있는데*
 * 안 열리는 경우에는 절대 새로 만들지 않는다(그건 그냥 비밀번호가 틀린 것이고, 덮어쓰면
 * 그 사람의 DM이 통째로 죽는다). create_user_keys가 서버에서도 같은 것을 막는다.
 */
export async function openVault(db: Client, authUserId: string, password: string, email: string) {
  const stored = await fetchStoredKeys(db)
  if (!stored) return createVault(db, authUserId, password, email)

  const { encKey, keys } = await unlockWithPassword(password, email, stored)
  await rememberEncKey(authUserId, encKey)
  hold(authUserId, keys)
  return { recoveryCode: null }
}

/**
 * 새로고침 이후. 비밀번호는 없고 IndexedDB의 encKey만 있다. 열 수 없으면 null을 주고,
 * 호출자는 잠긴 상태로 다룬다 -- 실패를 조용히 삼키면 "메시지가 하나도 없네"로 보인다.
 */
export async function resumeVault(db: Client, authUserId: string) {
  if (unlocked?.authUserId === authUserId) return unlocked

  const encKey = await recallEncKey(authUserId)
  if (!encKey) return null

  const stored = await fetchStoredKeys(db)
  if (!stored) return null

  try {
    return hold(authUserId, await unlockWithEncKey(encKey, stored))
  } catch (error) {
    // 다른 기기에서 비밀번호를 바꿨다. 들고 있던 encKey는 이제 아무것도 열지 않는다.
    if (error instanceof WrongPasswordError) {
      await forgetEncKey(authUserId)
      return null
    }
    throw error
  }
}

/**
 * 비밀번호 재설정. 메일 링크가 준 세션 위에서 돈다.
 *
 * **updateUser를 먼저 부르고 RPC를 나중에 부르는 순서가 중요하다.** 두 시스템에 걸친
 * 2단계 커밋이라 중간에 죽을 수 있고, 그때 어느 쪽이 살아남느냐가 갈린다:
 *
 *   - updateUser 성공, RPC 실패: 새 비밀번호로 로그인되지만 금고는 옛 encKey로 봉인된 채다.
 *     그런데 복구 코드는 아직 옛것 그대로이므로(RPC가 안 돌았으니) 이 흐름을 다시 타면 된다.
 *     **복구 가능하다.**
 *   - RPC 성공, updateUser 실패: 금고는 새 encKey로 봉인됐는데 로그인은 여전히 옛 비밀번호를
 *     요구한다 -- 그 비밀번호를 몰라서 여기 온 사람에게. 게다가 새 복구 코드는 화면에 뜨기
 *     전에 죽었다. **계정이 벽돌이 된다.**
 *
 * 그래서 무조건 updateUser가 먼저다.
 */
export async function resetVaultWithRecoveryCode(
  db: Client,
  authUserId: string,
  recoveryCode: string,
  newPassword: string,
  email: string
) {
  const stored = await fetchStoredKeys(db)
  if (!stored) throw new Error("key vault not found")

  const keys = await unlockWithRecoveryCode(recoveryCode, email, stored)
  const resealed = await resealAccount(keys, newPassword, email)

  const { error: authError } = await db.auth.updateUser({ password: resealed.authHash })
  if (authError) throw authError

  const { error } = await db.rpc("reseal_user_keys", {
    p_wrapped_user_key: resealed.stored.wrapped_user_key,
    p_recovery_wrapped_user_key: resealed.stored.recovery_wrapped_user_key,
  })
  if (error) throw error

  await rememberEncKey(authUserId, resealed.encKey)
  hold(authUserId, keys)
  // 옛 코드는 방금 덮어쓴 blob을 열던 것이라, 살려두면 거짓말이 된다.
  return { recoveryCode: resealed.recoveryCode }
}

/**
 * 비밀번호도 복구 코드도 없다. 신원키까지 전부 새로 만든다.
 *
 * 지난 1:1 대화는 이 사람에게 영영 닫힌다. 우회로를 만들 수 있다면 그건 서버가 읽을 수
 * 있다는 뜻이므로, 이건 고칠 버그가 아니라 종단간 암호화가 뜻하는 바다. 상대방 쪽 히스토리는
 * 상대의 키로 그대로 남는다.
 */
export async function rotateVault(
  db: Client,
  authUserId: string,
  newPassword: string,
  email: string
) {
  const account = await rotateAccount(newPassword, email)

  const { error: authError } = await db.auth.updateUser({ password: account.authHash })
  if (authError) throw authError

  const { error } = await db.rpc("rotate_user_keys", {
    p_identity_public_key: account.stored.identity_public_key,
    p_wrapped_user_key: account.stored.wrapped_user_key,
    p_wrapped_identity_secret_key: account.stored.wrapped_identity_secret_key,
    p_recovery_wrapped_user_key: account.stored.recovery_wrapped_user_key,
  })
  if (error) throw error

  await rememberEncKey(authUserId, account.encKey)
  hold(authUserId, account.keys)
  return { recoveryCode: account.recoveryCode }
}

/** 지금 열려 있는 열쇠. 잠겨 있으면 null. */
export function currentVault() {
  return unlocked
}

/** 로그아웃. 기기에 아무것도 남기지 않는다. */
export async function closeVault() {
  const authUserId = unlocked?.authUserId
  unlocked = null
  await forgetEncKey(authUserId)
}
