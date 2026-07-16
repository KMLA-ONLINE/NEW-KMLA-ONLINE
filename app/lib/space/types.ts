/**
 * 목록·디렉터리에 뜨는 space 한 줄. 그룹 내부(GroupSpace)와 달리 운영 필드(post_policy, 익명 허용,
 * 내 역할)는 없다 -- 목록은 "이게 뭔가"와 "나와 무슨 관계인가"만 답하면 된다.
 */
export type SpaceSummary = {
  /** spaces.pub_id 슬러그. 상세 URL(/groups/:pubId)에 실린다. */
  pubId: string
  name: string
  description: string
  /** spaces.space_type. group=공식(학교가 운영), community=비공식(학생들이 만든다). */
  type: "group" | "community"
  /** spaces.image_url 기반 서명 URL. null이면 이니셜 폴백. */
  imageUrl: string | null
  /** spaces.cover_image_url 기반 서명 URL. null이면 그라디언트. 카드형(찾기)에서만 쓴다. */
  coverImageUrl: string | null
  /**
   * spaces.join_policy. 가입 버튼이 "가입"인지 "가입 요청"인지를 가른다.
   *
   * **invite_only는 찾기 목록에 절대 안 나온다** -- spaces_select가 비멤버에게 그 space의 존재
   * 자체를 숨기기 때문이다. 그래서 미가입 카드의 정책은 사실상 public 아니면 request다.
   */
  joinPolicy: "public" | "request" | "invite_only"
  /** spaces.member_count. 캐시 컬럼이라(join/leave RPC가 갱신) 목록에서 보여줘도 싸다. */
  memberCount: number
  /** space_members에 내 행이 있는지. */
  isMember: boolean
  /**
   * space_members.pinned_at 중 **내 행**. 개인 고정이라 나에게만 보인다.
   *
   * 멤버일 때만 의미가 있다 -- 비멤버는 space_members 행이 없어서 고정할 대상이 없다.
   * 찾기 카드에 핀이 없는 건 디자인 선택이 아니라 스키마가 그렇게 생겼기 때문이다.
   */
  pinnedAt: string | null
  /**
   * space_join_requests에 내 행이 있는지 -- request 정책 그룹에 요청을 넣고 승인을 기다리는 중.
   * 가입도 미가입도 아닌 **제3의 상태**라, 이걸 안 그리면 요청을 넣은 사람이 "가입" 버튼을
   * 계속 보고 또 누른다.
   */
  hasPendingRequest: boolean
}
