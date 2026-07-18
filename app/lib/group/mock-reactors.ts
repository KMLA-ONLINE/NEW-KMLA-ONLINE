import type { GroupPostReactor } from "~/lib/group/types"
import { PLACEHOLDER_REACTION_TYPES } from "~/lib/reactions"

// 반응자 목록 목데이터를 합성한다. 실제 백엔드는 모달을 열 때 get_post_reactors류 RPC로
// post_reactions ⋈ profiles ⋈ reaction_types를 페이지 단위로 읽지만(GroupPost.reactors 주석 참고),
// 목엔 그 로더가 없어 글의 reactionCount·topReactions에 아귀가 맞게 미리 만들어 둔다:
// 총원 = reactionCount, 눌린 아이콘 = topReactions(많은 순). PLACEHOLDER_REACTION_TYPES가
// 진짜 reaction_types로 갈리는 날 이 파일만 지우면 된다(컴포넌트는 reactors를 props로만 받는다).

// topReactions는 아이콘 문자열이라, 반응자에 심을 reaction_type_id로 되짚는다. icon이 없는
// 타입(seed 미비)은 요약에도 안 뜨니 지도에서 뺀다.
const ICON_TO_TYPE_ID = new Map(
  PLACEHOLDER_REACTION_TYPES.flatMap((type) => (type.icon ? [[type.icon, type.id] as const] : []))
)

// 큰 글에 "요약(top 3) 밖의 소수 반응"을 붙일 때 어떤 이모지부터 쓸지. 흔한 👍·❤️·😆는 대개
// 이미 상위라, 드물게 눌리는 😢·😡·😮를 앞세워야 꼬리 반응이 자연스럽다("몇 명은 슬퍼했다").
const TAIL_ICON_PREFERENCE = ["😢", "😡", "😮", "😆", "❤️", "👍"].filter((icon) =>
  ICON_TO_TYPE_ID.has(icon)
)

// 반응자 이름 풀. 한 글의 반응자는 서로 다른 사람이어야 해서(한 사람은 한 번만 반응) 가장 큰
// reactionCount보다 넉넉히 둔다 -- seq를 풀 길이로 나눈 나머지로 뽑으므로 풀보다 적게 쓰면 한
// 글 안에서 이름이 겹치지 않는다. 글끼리는 같은 이름이 다시 나온다(같은 사람이 여러 글에 반응).
const REACTOR_NAME_POOL = [
  "김지원",
  "이현우",
  "박서연",
  "정하늘",
  "이민서",
  "김도윤",
  "최유진",
  "한지호",
  "강서윤",
  "조은우",
  "임채원",
  "신도현",
  "오지안",
  "배준서",
  "홍시우",
  "문가람",
  "안예린",
  "유하준",
  "곽민준",
  "남서아",
  "서준혁",
  "윤가은",
  "장민재",
  "권나은",
  "황시윤",
  "노아린",
  "전우진",
  "고서준",
  "양지우",
  "백하은",
  "송민재",
  "류채은",
  "손도현",
  "허예진",
  "심우빈",
  "구자현",
  "표서윤",
  "성하준",
  "진소율",
  "차민서",
  "추예서",
  "방시원",
  "국지민",
  "탁현우",
  "육서아",
  "마준혁",
  "설유나",
  "봉재훈",
  "제갈영",
  "선우빈",
]

// 반응 시각의 기준점. 표시엔 안 쓰이고(목록은 이름+배지만 보여준다) "전체" 탭 정렬용이라 값
// 자체보다 상대 순서만 의미가 있다. 최신 반응이 이 시각, 뒤로 갈수록 과거로 흩어진다.
const BASE_REACTION_TIME_MS = Date.parse("2026-07-13T12:00:00.000Z")
const REACTION_INTERVAL_MS = 90_000

// 아이콘별 인원을 정한다. topReactions가 이미 많은 순이라 앞쪽 아이콘에 가중치를 실어(k, k-1, …)
// 그 순서를 지킨다 -- 첫 아이콘이 가장 많아야 topReactions와 아귀가 맞는다. 반올림 오차는 첫
// 아이콘에 몰아 합계가 정확히 reactionCount가 되게 한다.
function distribute(reactionCount: number, iconCount: number): number[] {
  const totalWeight = (iconCount * (iconCount + 1)) / 2
  const perIcon = Array.from({ length: iconCount }, (_, i) =>
    Math.round((reactionCount * (iconCount - i)) / totalWeight)
  )
  perIcon[0] += reactionCount - perIcon.reduce((sum, n) => sum + n, 0)
  return perIcon
}

export function makeMockReactors(
  reactionCount: number,
  topReactions: string[]
): GroupPostReactor[] {
  const topIcons = topReactions.filter((icon) => ICON_TO_TYPE_ID.has(icon))
  if (reactionCount <= 0 || topIcons.length === 0) return []

  // 꼬리 반응(요약 밖 소수 타입): 큰 글일수록 한둘 더 붙여 모달 탭을 다양하게 한다. 몫은 항상
  // 1~2명이라 상위 최소 몫보다 작고(그래서 top-3=topReactions가 유지된다), 총원은 상위에서
  // 그만큼 덜어와 reactionCount를 지킨다. 작은 글(<12)엔 안 붙인다 -- 없는 게 더 자연스럽다.
  const tailBudget = reactionCount >= 20 ? 2 : reactionCount >= 12 ? 1 : 0
  const tailIcons = TAIL_ICON_PREFERENCE.filter((icon) => !topIcons.includes(icon)).slice(
    0,
    tailBudget
  )
  const tailPer = tailIcons.map((_, i) => (i === 0 ? 2 : 1))
  const tailTotal = tailPer.reduce((sum, n) => sum + n, 0)

  // (타입, 인원) 버킷: 상위(많은 순) 다음에 꼬리. distribute가 상위 몫을 내림차순으로 준다.
  const topPer = distribute(reactionCount - tailTotal, topIcons.length)
  const buckets = [
    ...topIcons.map((icon, i) => ({ typeId: ICON_TO_TYPE_ID.get(icon)!, count: topPer[i] })),
    ...tailIcons.map((icon, i) => ({ typeId: ICON_TO_TYPE_ID.get(icon)!, count: tailPer[i] })),
  ]

  // 타입을 라운드로빈으로 시간축에 흩뿌린다 -- 안 그러면 "전체"를 시간순으로 봐도 👍가 다 몰리고
  // 뒤에 ❤️가 몰려, 사실상 타입별 묶음처럼 보인다. 섞어야 "여러 반응이 시간에 걸쳐 달렸다"가 된다.
  const remaining = buckets.map((bucket) => bucket.count)
  const total = remaining.reduce((sum, n) => sum + n, 0)
  const sequence: number[] = []
  while (sequence.length < total) {
    for (let i = 0; i < buckets.length; i++) {
      if (remaining[i] > 0) {
        sequence.push(buckets[i].typeId)
        remaining[i]--
      }
    }
  }

  // sequence[0]이 가장 최근. 이름은 seq로 뽑아 한 글 안에서 겹치지 않게 한다(풀 > 최대 인원).
  return sequence.map((reactionTypeId, seq) => ({
    id: 9000 + seq,
    name: REACTOR_NAME_POOL[seq % REACTOR_NAME_POOL.length],
    avatarUrl: null,
    reactionTypeId,
    createdAt: new Date(BASE_REACTION_TIME_MS - seq * REACTION_INTERVAL_MS).toISOString(),
  }))
}
