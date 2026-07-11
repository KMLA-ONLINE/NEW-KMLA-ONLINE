import * as React from "react"
import { Lock, Users } from "lucide-react"
import { Spinner } from "../../atoms/Spinner"
import { InfiniteScrollWrapper } from "../../cross-cutting/InfiniteScrollWrapper"
import { GroupHeader } from "../../organisms/GroupHeader"
import { PageHeader } from "../../organisms/PageHeader/PageHeader"
import { PostCard } from "../../organisms/PostCard"
import { PrimaryNavigation } from "../../organisms/PrimaryNavigation/PrimaryNavigation"
import { SectionNav } from "../../molecules/SectionNav"
import type { SectionNavItem } from "../../molecules/SectionNav"
import { Divider } from "../../atoms/Divider"

export interface GroupPagePost {
  author: { name: string; avatarFallback: string }
  content: string
  groupName: string
  images: { src: string; alt: string }[]
  stats: { likes: number; comments: number }
  timestamp: string
}

export interface GroupPageTab {
  label: string
  href: string
  icon?: React.ComponentType<{ className?: string }>
  isActive?: boolean
}

export type GroupPageProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children">

const mockImage = (from: string, to: string, accent: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${from}"/>
          <stop offset="1" stop-color="${to}"/>
        </linearGradient>
      </defs>
      <rect width="720" height="720" fill="url(#bg)"/>
      <circle cx="560" cy="140" r="96" fill="${accent}" opacity=".58"/>
      <path d="M88 548 264 338l116 126 70-86 182 170H88z" fill="#fff" opacity=".42"/>
      <rect x="96" y="92" width="212" height="144" rx="18" fill="#fff" opacity=".18"/>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const posts = [
  {
    author: "studio.nari",
    time: new Date("2026-05-05T09:12:00.000Z"),
    image: mockImage("#2563eb", "#38bdf8", "#fbbf24"),
    caption: "Quiet morning light, new notebook, and a feed mockup draft.",
    likes: 2184,
    comments: 128,
  },
  {
    author: "daily.grid",
    time: new Date("2026-05-05T08:47:00.000Z"),
    image: mockImage("#111827", "#475569", "#f472b6"),
    caption: "Layout study: clean rails, image-first cards, compact actions.",
    likes: 984,
    comments: 42,
  },
  {
    author: "city.walk",
    time: new Date("2026-05-05T08:00:00.000Z"),
    image: mockImage("#15803d", "#5eead4", "#ffffff"),
    caption: "A small street corner with clean lines and late afternoon color.",
    likes: 1426,
    comments: 76,
  },
  {
    author: "light.table",
    time: new Date("2026-05-05T07:00:00.000Z"),
    image: mockImage("#d97706", "#fef3c7", "#2563eb"),
    caption: "Table scene, layered shadows, and a compact composition.",
    likes: 642,
    comments: 19,
  },
  {
    author: "frame.note",
    time: new Date("2026-05-05T06:00:00.000Z"),
    image: mockImage("#be185d", "#f472b6", "#fbbf24"),
    caption: "Saved references for image-first social layouts.",
    likes: 2031,
    comments: 94,
  },
] as const

const groupTabs: SectionNavItem[] = [
  { label: "게시물", href: "#", isActive: true },
  { label: "멤버", href: "#" },
  { label: "정보", href: "#" },
]

const GroupPage = React.forwardRef<HTMLDivElement, GroupPageProps>(
  ({ className, ...props }, ref) => {
    const [isNavCollapsed, setIsNavCollapsed] = React.useState(true)
    const [visiblePostCount, setVisiblePostCount] = React.useState(2)
    const [isLoadingMore, setIsLoadingMore] = React.useState(false)

    const visiblePosts = posts.slice(0, visiblePostCount)
    const hasMorePosts = visiblePostCount < posts.length

    const activeTab = groupTabs.find((tab) => tab.isActive)
    const showPosts = activeTab?.label === "게시물"

    const handleLoadMore = React.useCallback(() => {
      if (isLoadingMore || !hasMorePosts) {
        return
      }

      setIsLoadingMore(true)
      window.setTimeout(() => {
        setVisiblePostCount((count) => Math.min(count + 2, posts.length))
        setIsLoadingMore(false)
      }, 150)
    }, [hasMorePosts, isLoadingMore])

    return (
      <div
        ref={ref}
        className={`min-h-screen bg-[var(--color-surface-base)] text-[var(--color-text-primary)] ${className ?? ""}`}
        {...props}
      >
        <PageHeader />

        <main
          className={`mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 px-6 py-6 pb-28 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:pb-6 ${
            isNavCollapsed
              ? "lg:grid-cols-[2rem_minmax(0,1fr)]"
              : "lg:grid-cols-[13rem_minmax(0,1fr)]"
          }`}
        >
          <PrimaryNavigation
            activeKey="group"
            collapsed={isNavCollapsed}
            onCollapsedChange={setIsNavCollapsed}
            className="justify-self-start"
          />

          <div className="min-w-0 space-y-1">
            <GroupHeader
              name="과학기술부"
              category="과기부"
              isPrivate={true}
              isJoined={true}
              memberCount={35}
              className="relative bottom-7 -mb-7"
            />

            <SectionNav items={groupTabs} ariaLabel="그룹 메뉴" />

            <Divider className="mb-4" />

            {showPosts && (
              <div className="flex gap-6">
                <InfiniteScrollWrapper
                  className="flex-1 space-y-5"
                  hasMore={hasMorePosts}
                  isLoading={isLoadingMore}
                  onLoadMore={handleLoadMore}
                  loader={<Spinner label="Loading more posts" />}
                  endMessage={
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      You are all caught up
                    </span>
                  }
                >
                  <h1 className="sr-only">Group Posts</h1>
                  {visiblePosts.map((post) => (
                    <PostCard
                      key={post.author}
                      author={{
                        name: post.author,
                        avatarFallback: post.author,
                      }}
                      className="max-w-none"
                      content={post.caption}
                      images={[{ src: post.image, alt: `${post.author} post image` }]}
                      stats={{ likes: post.likes, comments: post.comments }}
                      timestamp={post.time}
                    />
                  ))}
                </InfiniteScrollWrapper>

                <aside className="hidden w-70 shrink-0 lg:block">
                  <div className="sticky top-24 space-y-4 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] p-4">
                    <h2 className="font-semibold">그룹 정보</h2>

                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-[var(--color-text-secondary)]">설명</p>
                        <p>
                          과학기술부 그룹입니다. UI/UX, 브랜딩, 타이포그래피 등 다양한 주제에 대해
                          이야기 나눠요.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-[var(--color-text-secondary)]" />
                        <span>비공개</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-[var(--color-text-secondary)]" />
                        <span>인원 {35}명</span>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }
)
GroupPage.displayName = "GroupPage"

export { GroupPage }
