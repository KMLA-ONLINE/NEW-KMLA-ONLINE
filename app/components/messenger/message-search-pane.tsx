import { useMemo, useState } from "react"
import { ArrowLeftIcon, SearchIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { formatMessageTime, getMessageAuthor, isDeletedMessage } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Message, Room } from "~/lib/messenger/types"

export function MessageSearchPane({
  room,
  compact = false,
  onBack,
  onOpenMessage,
}: {
  room: Room
  compact?: boolean
  onBack: () => void
  onOpenMessage: (messageId: string) => void
}) {
  const [draftQuery, setDraftQuery] = useState("")
  const [submittedQuery, setSubmittedQuery] = useState("")
  const hasPendingQuery = draftQuery.trim().length > 0 && draftQuery !== submittedQuery
  const normalizedQuery = submittedQuery.trim().toLowerCase()
  const results = useMemo(() => {
    if (!normalizedQuery) {
      return []
    }

    return room.messages.filter(
      (message) =>
        !isDeletedMessage(message) && message.content?.toLowerCase().includes(normalizedQuery)
    )
  }, [normalizedQuery, room.messages])

  const renderResult = (message: Message) => {
    const author = getMessageAuthor(room, message)

    return (
      <button
        key={message.id}
        type="button"
        onClick={() => onOpenMessage(message.id)}
        className="hover:bg-muted/60 flex w-full items-start gap-3 rounded-2xl p-2 text-left transition-colors"
      >
        <Avatar size="sm">
          <AvatarFallback>{author.initials}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{author.name}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {formatMessageTime(message.createdAt)}
            </span>
          </span>
          <span className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
            {message.content}
          </span>
        </span>
      </button>
    )
  }

  return (
    <aside
      className={cn(
        "bg-card flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
        !compact && "border-l"
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon-sm" aria-label="정보로 돌아가기" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <p className="min-w-0 truncate text-sm font-semibold">메시지 검색</p>
      </header>

      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-4">
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmittedQuery(draftQuery)
          }}
        >
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            type="search"
            value={draftQuery}
            className="bg-muted h-10 rounded-full border-0 pl-11 shadow-none"
            placeholder="메시지 검색"
            onChange={(event) => setDraftQuery(event.target.value)}
          />
        </form>
        {hasPendingQuery ? (
          <p className="text-muted-foreground px-3 text-xs">
            <span className="sm:hidden">검색을 눌러 검색하세요.</span>
            <span className="hidden sm:inline">Enter를 눌러 검색하세요.</span>
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!normalizedQuery ? (
          <div className="text-muted-foreground flex h-full items-center justify-center rounded-2xl border border-dashed p-8 text-center text-sm">
            검색어를 입력하고 Enter를 누르세요.
          </div>
        ) : results.length > 0 ? (
          <div className="flex flex-col gap-1">
            {results.map((message) => renderResult(message))}
          </div>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center rounded-2xl border border-dashed p-8 text-center text-sm">
            검색 결과가 없습니다.
          </div>
        )}
      </div>
    </aside>
  )
}
