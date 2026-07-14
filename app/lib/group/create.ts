import type { GroupSpace } from "~/lib/group/types"

/** create_space RPC가 받는 것과 같은 모양. 생성 화면과 설정 화면이 함께 쓴다. */
export type SpaceDraft = Pick<
  GroupSpace,
  "type" | "name" | "description" | "pubId" | "joinPolicy" | "postPolicy"
> & { allowAnonymous: boolean }

// spaces_pub_id_check와 같은 규칙: 소문자·숫자·하이픈, 3~50자, 하이픈으로 시작·끝나거나 연달 수 없다.
// 서버가 어차피 다시 본다 -- 여기서 막는 건 왕복 한 번을 아끼는 것뿐이다.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const SLUG_HINT = "소문자, 숫자, 하이픈만 쓸 수 있고 3~50자입니다."

export function isValidSlug(value: string): boolean {
  return value.length >= 3 && value.length <= 50 && SLUG_PATTERN.test(value)
}

// spaces.pub_id의 컬럼 default(uuid에서 하이픈을 뺀 앞 12자)를 흉내 낸다. 백엔드가 붙으면
// 서버가 만든 값을 받으므로 사라진다 -- 그때까지 만든 직후 보낼 주소가 필요할 뿐이다.
export function randomPubId(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 12)
}
