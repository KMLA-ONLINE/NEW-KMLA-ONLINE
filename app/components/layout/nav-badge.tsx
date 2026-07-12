import { cn } from "~/lib/utils"

// 내비 아이콘 우상단에 얹는 안 읽음 뱃지. 라벨이 아니라 아이콘에 붙는다 -- 탭바는 아이콘만 그리고,
// 사이드바는 접히면 라벨이 사라지기 때문에 라벨에 붙이면 두 곳 다 신호를 잃는다. 부모에 relative가
// 필요하다.
//
// 기본은 파란 알약이고, ring은 "뱃지 뒤에 실제로 깔린 표면 색"을 호출부가 넘긴다. 이게 중요한 이유:
// 사이드바에서 그 항목이 활성이면 뒤에 깔린 게 흰 배경이 아니라 파란 알약이라, 파란 뱃지가 파란
// 알약에 묻힌다. 그 경우엔 호출부가 색을 반전시켜(흰 알약 + 파란 숫자) 알약에서 파낸 것처럼 만든다.
// 링만 흰색으로 둘러 억지로 띄우면 스티커를 붙인 것처럼 보인다.
//
// aria-hidden인 이유: 개수는 링크의 aria-label이 이미 읽어준다. 여기서 또 읽으면 중복이다.
export function NavBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null

  return (
    <span
      aria-hidden="true"
      className={cn(
        "bg-primary text-primary-foreground pointer-events-none absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold tabular-nums ring-2",
        className
      )}
    >
      {/* 뱃지는 99 위를 구분하지 않는다. get_unread_message_count()가 대화당 100에서 세기를
          멈추는 것도 같은 이유다 -- 여기서 안 보여줄 정확도를 DB가 비싸게 셀 이유가 없다. */}
      {count > 99 ? "99+" : count}
    </span>
  )
}
