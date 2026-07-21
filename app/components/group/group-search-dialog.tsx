import { SearchIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { RelativeTime } from "~/components/relative-time"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { useDebouncedValue } from "~/hooks/use-debounced-value"
import { normalizeSearch } from "~/lib/group/format"
import type { GroupPost } from "~/lib/group/types"
import { toPlainTextPreview } from "~/lib/rich-text/render"

// 제목·본문을 정규화해 부분 일치(normalizeSearch = 공백 제거 + 소문자, DB trgm 인덱스와 같은 계약).
// 원격 검색은 백엔드 붙일 때.

export function GroupSearchDialog({
  open,
  onOpenChange,
  posts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  posts: GroupPost[]
}) {
  const [query, setQuery] = useState("")
  // 입력은 즉시 반영하되 실제 검색은 타이핑이 멈춘 뒤에만(백엔드에 붙으면 키 입력마다 쿼리 방지).
  const trimmed = useDebouncedValue(query.trim(), 400)
  const needle = normalizeSearch(trimmed)
  const results = needle
    ? posts.filter(
        (post) =>
          normalizeSearch(post.title).includes(needle) ||
          normalizeSearch(post.content).includes(needle)
      )
    : []

  const close = () => onOpenChange(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setQuery("")
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-[85svh] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-lg"
      >
        <DialogHeader className="flex-row items-center gap-2 border-b p-3">
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="닫기">
            <XIcon />
          </Button>
          <div className="relative flex-1">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
              placeholder="게시물 검색"
              className="bg-muted h-9 rounded-full border-0 pl-9 shadow-none"
            />
          </div>
          <DialogTitle className="sr-only">게시물 검색</DialogTitle>
          <DialogDescription className="sr-only">
            이 그룹의 게시물을 제목·본문으로 검색합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!trimmed ? (
            <p className="text-muted-foreground p-8 text-center text-sm">
              제목이나 내용으로 검색해 보세요.
            </p>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground p-8 text-center text-sm">
              “{trimmed}”에 대한 검색 결과가 없습니다.
            </p>
          ) : (
            <ul className="divide-border/70 flex flex-col divide-y">
              {results.map((post) => (
                <li key={post.id}>
                  <Link
                    to={`posts/${post.pubId}`}
                    onClick={close}
                    className="hover:bg-muted/60 flex flex-col gap-1 px-4 py-3 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {post.category ? (
                        <Badge variant="secondary" className="shrink-0">
                          {post.category.name}
                        </Badge>
                      ) : null}
                      <p className="line-clamp-1 text-sm font-medium">{post.title}</p>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {toPlainTextPreview(post.content)}
                    </p>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span className="truncate">{post.author?.name ?? "익명"}</span>
                      <span aria-hidden="true">·</span>
                      <RelativeTime value={post.createdAt} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
