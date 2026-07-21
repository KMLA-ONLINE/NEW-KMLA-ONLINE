import type { MyProfile } from "~/lib/profile/types"

// 프로필 화면과 메뉴의 계정 블록이 같은 사람을 보여준다. 두 곳에 각자 두면 이름 하나 고칠 때
// 한쪽이 낡은 채로 남으므로, 로더가 붙을 때까지 그 한 사람은 여기 산다.
//
// 모양은 `get_my_profile()`이 내주는 행 그대로다 -- 타입이 생성된 RPC 반환 행에서 나오므로
// (MyProfile), 컬럼명을 지어내거나 "2시간 전" 같은 표시용 문자열을 섞으면 타입이 먼저 깨진다.
// 로더가 붙는 날 이 상수를 rpc 호출로 바꾸면 화면은 그대로 돌아야 한다.
//
// 비어 있는 값(null)도 일부러 섞어 둔다. 전부 채워진 mock은 "아직 안 채운 사람"의 화면을
// 한 번도 보여주지 않아서, 정작 그 사람에게만 레이아웃이 무너진다.
export const mockProfile: MyProfile = {
  id: 1,
  name: "김민족",
  role: "user",
  type: "student",
  student_number: "251000",
  class_no: 1,
  cohort: 30,
  gender: "male",
  track: "international",
  department: "과학기술부",
  phone_number: "01000000000",
  avatar_url: null,
  cover_image_url: null,
  birthday: "2009-03-01",
  description: "소개글입니다. 소개글입니다. 소개글입니다. ",
  status: "accepted",
  dorm_room: 305,
  is_reenrolled: false,
  onboarding_completed_at: "2026-03-02T01:12:00.000Z",
  status_updated_at: "2026-03-03T08:40:00.000Z",
  created_at: "2026-03-01T09:00:00.000Z",
  updated_at: null,
}

// profiles에 이메일 컬럼은 없다. 로그인 계정(auth.users)의 값이라 프로필 조회와는 다른 곳에서 온다.
// 프로필 화면에는 나오지 않는다 -- 그 화면은 남에게도 보이는 명부고, 이메일은 로그인 수단이라
// 계정 설정(메뉴)에만 뜬다.
//
// TODO(backend): `supabase.auth.getUser()`의 `user.email`.
export const mockProfileEmail = "minjok.kim@kmlaonline.kr"

// avatars/profile-covers는 비공개 버킷이라 실제로는 서명 URL이 온다. 아직 올린 사진이 없는
// 상태(둘 다 null)를 기본으로 둔다 -- 폴백이 기본값인 화면이라 그쪽이 정상 상태다.
export const mockProfileAvatarUrl: string | null = null
export const mockProfileCoverUrl: string | null = null

// `profile_departments`. 부서는 자유 입력이 아니라 lookup FK라, 편집 폼은 반드시 이 목록에서
// 고르게 해야 한다 -- 목록 밖의 이름은 DB가 FK로 거절한다.
//
// TODO(backend): `supabase.from("profile_departments").select("name").order("name")`.
// authenticated에게 select가 열려 있어 RPC가 필요 없다.
export const mockProfileDepartments: { name: string }[] = [
  { name: "과학기술부" },
  { name: "금융정보부" },
  { name: "도서부" },
  { name: "동아리관리부" },
  { name: "문화기획부" },
  { name: "방송부" },
  { name: "법무부" },
  { name: "식품영양부" },
  { name: "영어상용부" },
  { name: "체육부" },
  { name: "학습부" },
  { name: "환경부" },
]
