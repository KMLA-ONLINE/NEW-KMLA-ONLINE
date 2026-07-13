import { useState } from "react"

import { GroupPostFeed } from "~/components/group/group-post-feed"
import { PostViewToggle } from "~/components/group/post-view-toggle"
import { usePostViewMode } from "~/components/group/use-post-view-mode"
import { Separator } from "~/components/ui/separator"
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll"
import { mockFeedPosts, mockMealPlan } from "~/lib/feed/mock-data"
import { PLACEHOLDER_REACTION_TYPES } from "~/lib/reactions"

// 피드도 한 번에 다 렌더하지 않고 페이지 단위로(스크롤이 바닥에 닿으면 다음 페이지). 그룹 피드와
// 같은 규칙 -- 로더가 붙으면 이 슬라이스가 list_feed_posts의 keyset 페이지네이션으로 바뀐다.
const FEED_PAGE_SIZE = 6

// 여러 그룹의 글을 한 흐름으로 모아 순수 최신순으로 보여준다(created_at 내림차순). 고정은 그룹
// 안에서만 의미가 있어(무슨 기준으로 맨 위?) 피드엔 없다. ISO 문자열이라 사전식이 곧 시간순.
const feedPosts = [...mockFeedPosts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

export const handle = { mobileContentEdge: "bleed" as const }

export default function AppHomePage() {
  const [viewMode, setViewMode] = usePostViewMode()
  const [visible, setVisible] = useState(FEED_PAGE_SIZE)

  const hasMore = visible < feedPosts.length
  const sentinelRef = useInfiniteScroll(
    () => setVisible((count) => count + FEED_PAGE_SIZE),
    hasMore
  )
  const visiblePosts = feedPosts.slice(0, visible)

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="flex min-w-0 flex-col gap-2 sm:gap-4">
        {/* 모바일 bleed에선 카드가 가장자리까지 가지만, 제목·토글은 px-4로 카드 내부 여백에 맞춘다. */}
        <div className="flex items-center justify-between px-4 pt-1 sm:px-0">
          <h1 className="text-xl font-semibold sm:text-2xl">피드</h1>
          <PostViewToggle value={viewMode} onChange={setViewMode} />
        </div>
        <GroupPostFeed
          posts={visiblePosts}
          viewMode={viewMode}
          reactionTypes={PLACEHOLDER_REACTION_TYPES}
          hasMore={hasMore}
          sentinelRef={sentinelRef}
        />
      </section>

      <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
        <MealPlanCard />
      </aside>
    </div>
  )
}

// 오늘의 급식. 지금은 레이아웃만 -- 데이터는 나중에 cron이 급식 API에서 받아 채운다.
function MealPlanCard() {
  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">오늘의 급식</h2>
        <span className="text-muted-foreground text-xs">{mockMealPlan.dateLabel}</span>
      </div>
      <Separator />
      <ul className="flex flex-col gap-3">
        {mockMealPlan.meals.map((meal) => (
          <li key={meal.label} className="flex flex-col gap-0.5">
            <p className="text-muted-foreground text-xs font-medium">{meal.label}</p>
            <p className="text-sm leading-relaxed">{meal.items.join(" · ")}</p>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground border-t pt-2 text-[11px]">
        매일 자동으로 업데이트됩니다.
      </p>
    </div>
  )
}
