import { Suspense, use, useState } from "react"
import { Link } from "react-router"

import { GroupPostFeed } from "~/components/group/group-post-feed"
import { PostViewToggle } from "~/components/group/post-view-toggle"
import { usePostViewMode } from "~/components/group/use-post-view-mode"
import { Separator } from "~/components/ui/separator"
import { useInfiniteScroll } from "~/hooks/use-infinite-scroll"
import { mockFeedPosts } from "~/lib/feed/mock-data"
import { getTodayMealPlan } from "~/lib/meal/neis"
import { PLACEHOLDER_REACTION_TYPES } from "~/lib/reactions"

// TODO(backend): 첫 페이지는 clientLoader가 list_feed_posts(null, 10)를 await하고 mapPostRows로
// 변환한다. 이후 페이지는 useFetcher로 같은 clientLoader에 `before=<마지막 post_id>`를 보내며,
// fetcher.data를 **응답마다 한 번만** 기존 배열 뒤에 붙인다. hasMore는 원본 RPC 행이 10개인지로,
// cursor는 매핑 전 마지막 행의 post_id로 정한다. 컴포넌트/useEffect에서 Supabase를 직접 호출하지
// 않는다. 아래 6은 mock 8개로 스크롤을 확인하기 위한 값일 뿐 실제 RPC limit으로 재사용하지 않는다.
const MOCK_FEED_PAGE_SIZE = 6

// 여러 그룹의 글을 한 흐름으로 모아 순수 최신순으로 보여준다(created_at 내림차순). 고정은 그룹
// 안에서만 의미가 있어(무슨 기준으로 맨 위?) 피드엔 없다. ISO 문자열이라 사전식이 곧 시간순.
const feedPosts = [...mockFeedPosts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

export const handle = {
  mobileContentEdge: "bleed" as const,
  showMobileHeader: true,
  autoHideMobileChrome: true,
}

export default function AppHomePage() {
  const [viewMode, setViewMode] = usePostViewMode()
  const [visible, setVisible] = useState(MOCK_FEED_PAGE_SIZE)

  const hasMore = visible < feedPosts.length
  const sentinelRef = useInfiniteScroll(() => setVisible((count) => count + MOCK_FEED_PAGE_SIZE), {
    enabled: hasMore,
    // TODO(backend): useFetcher로 다음 list_feed_posts 페이지를 붙이면 반드시
    // `pending: fetcher.state !== "idle"`을 넘긴다. hook이 요청 중 observer를 끊어 중복 호출을 막고,
    // 완료 뒤 sentinel이 여전히 보이면 다시 연결해 짧은 페이지를 이어서 채운다.
  })
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
          empty={
            <div className="text-muted-foreground py-16 text-center">
              <p className="text-foreground font-semibold">아직 올라온 글이 없습니다</p>
              <p className="mt-1 text-sm">
                <Link to="/groups" className="underline">
                  내 그룹
                </Link>
              </p>
            </div>
          }
        />
      </section>

      <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
        <Suspense fallback={<MealPlanCardLoading />}>
          <MealPlanCard />
        </Suspense>
      </aside>
    </div>
  )
}

function MealPlanCard() {
  const mealPlan = use(getTodayMealPlan())

  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">오늘의 급식</h2>
        <span className="text-muted-foreground text-xs">{mealPlan.dateLabel}</span>
      </div>
      <Separator />
      {mealPlan.meals.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {mealPlan.meals.map((meal) => (
            <li key={meal.label} className="flex flex-col gap-0.5">
              <p className="text-muted-foreground text-xs font-medium">{meal.label}</p>
              <p className="text-sm leading-relaxed">{meal.items.join(" · ")}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground py-3 text-center text-xs">
          {mealPlan.unavailable
            ? "급식 정보를 불러오지 못했습니다."
            : "오늘은 등록된 급식이 없습니다."}
        </p>
      )}
    </div>
  )
}

function MealPlanCardLoading() {
  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
      <h2 className="text-sm font-semibold">오늘의 급식</h2>
      <Separator />
      <p className="text-muted-foreground py-3 text-center text-xs">
        급식 정보를 불러오는 중입니다.
      </p>
    </div>
  )
}
