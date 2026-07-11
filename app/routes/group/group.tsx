import { PenSquareIcon } from "lucide-react"

import { GroupHeader } from "~/components/group/group-header"
import { GroupPostFeed } from "~/components/group/group-post-feed"
import { PostViewToggle } from "~/components/group/post-view-toggle"
import { usePostViewMode } from "~/components/group/use-post-view-mode"
import { Separator } from "~/components/ui/separator"
import { mockGroup, mockGroupPosts } from "~/lib/group/mock-data"

// 라우트는 /groups/:pubId. 슬러그로 space와 글을 읽는 로더는 백엔드 붙일 때 추가한다.
export default function GroupPage() {
  const [viewMode, setViewMode] = usePostViewMode()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <GroupHeader group={mockGroup} />

      <button
        type="button"
        className="hover:bg-muted/60 flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors"
      >
        <div className="bg-muted size-8 shrink-0 rounded-full" aria-hidden="true" />
        <span className="text-muted-foreground text-sm">{mockGroup.name}에 글을 남겨보세요…</span>
        <PenSquareIcon className="text-muted-foreground ml-auto size-4" aria-hidden="true" />
      </button>

      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-medium tracking-wide">게시물</h2>
          <PostViewToggle value={viewMode} onChange={setViewMode} />
        </div>
        <Separator className="my-1" />
        <GroupPostFeed posts={mockGroupPosts} viewMode={viewMode} />
      </section>
    </div>
  )
}
