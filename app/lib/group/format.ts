import type { GroupMemberRole } from "~/lib/group/types"

// space_members.role의 표시 이름. 멤버 목록과 알림(space_role_changed)이 같은 이름을 써야 해서
// 컴포넌트가 아니라 여기 산다.
export const ROLE_LABEL: Record<GroupMemberRole, string> = {
  owner: "소유자",
  admin: "관리자",
  manager: "매니저",
  member: "멤버",
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// 검색어 정규화(공백 제거 + 소문자). DB의 trgm 검색 인덱스가
// regexp_replace(lower(x), '\s+', '')로 정규화하는 것과 같은 계약 -- 게시물·멤버 검색 공용.
export function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "")
}
