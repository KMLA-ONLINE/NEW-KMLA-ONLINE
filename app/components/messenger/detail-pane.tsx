import {
  ArrowLeftIcon,
  BellIcon,
  BellOffIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleUserRoundIcon,
  ImageIcon,
  PanelRightCloseIcon,
  PencilIcon,
  PinIcon,
  SearchIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Link } from "react-router"

import { ConversationAvatar } from "~/components/messenger/conversation-avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { CURRENT_USER } from "~/lib/messenger/constants"
import { getRoomSubtitle } from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type { Room } from "~/lib/messenger/types"

export function DetailPane({
  room,
  compact = false,
  onBack,
  onClose,
  onOpenMedia,
  onOpenMembers,
  onOpenPinnedMessages,
  onOpenSearch,
  onMutedChange,
  onRenameGroup,
}: {
  room: Room
  compact?: boolean
  onBack?: () => void
  onClose?: () => void
  onOpenMedia?: () => void
  onOpenMembers?: () => void
  onOpenPinnedMessages?: () => void
  onOpenSearch?: () => void
  onMutedChange?: (muted: boolean) => void
  onRenameGroup?: (name: string) => void
}) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const trimmedRenameValue = renameValue.trim()
  // conversations_shape_check: 그룹 이름은 공백 제거 후 1~100자여야 한다(supabase/schemas/05-chat.sql).
  const isRenameValid =
    trimmedRenameValue.length >= 1 &&
    trimmedRenameValue.length <= 100 &&
    trimmedRenameValue !== room.name

  const openRename = () => {
    setRenameValue(room.name)
    setIsRenameOpen(true)
  }

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isRenameValid) {
      return
    }
    // Frontend-only until a rename RPC exists. 서버에는 아직 이름 변경 함수가 없다
    // (create_group_chat / create_group_chat_with_members만 있음). 배선 때는 여기서
    // update_conversation_name(p_conversation_id, p_name) 류의 RPC를 호출하고, 성공
    // 응답을 받은 뒤에만 낙관적 갱신을 확정한다.
    onRenameGroup?.(trimmedRenameValue)
    setIsRenameOpen(false)
  }
  const notificationOptions = [
    {
      muted: false,
      label: "알림 받기",
      description: "이 대화의 새 메시지 알림을 받습니다",
      icon: BellIcon,
    },
    {
      muted: true,
      label: "알림 끄기",
      description: "알림만 끄고 읽지 않은 메시지는 그대로 표시합니다",
      icon: BellOffIcon,
    },
  ]
  const peer =
    room.type === "direct"
      ? room.participants.find((participant) => participant.id !== CURRENT_USER.id)
      : undefined

  return (
    <aside
      className={cn("bg-card flex h-full min-h-0 flex-col overflow-hidden", !compact && "border-l")}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {compact && onBack ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to conversation"
              onClick={onBack}
            >
              <ArrowLeftIcon />
            </Button>
          ) : null}
          <p className="text-sm font-semibold">{room.type === "group" ? "그룹 정보" : "정보"}</p>
        </div>
        {!compact && onClose ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close conversation info"
            onClick={onClose}
          >
            <PanelRightCloseIcon />
          </Button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="rounded-[1.5rem] p-5 text-center">
          <div className="flex justify-center">
            <ConversationAvatar room={room} linkProfile className="size-20" />
          </div>
          <h2 className="mt-3 text-lg font-semibold">{room.name}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{getRoomSubtitle(room)}</p>
          {room.type === "direct" ? (
            <Badge asChild variant="outline" className="mt-1">
              <a
                href="https://www.cloudflare.com/ko-kr/learning/privacy/what-is-end-to-end-encryption/"
                target="_blank"
                rel="noreferrer"
                aria-label="종단간 암호화에 대해 알아보기 (새 창)"
              >
                <ShieldCheckIcon data-icon="inline-start" />
                종단간 암호화됨
              </a>
            </Badge>
          ) : null}

          <div className="mt-5 flex items-start justify-center gap-4">
            {room.type === "direct" && peer ? (
              <QuickAction
                icon={CircleUserRoundIcon}
                label="프로필"
                to={`/profile/${peer.id}`}
                ariaLabel={`${peer.name} 프로필 보기`}
              />
            ) : (
              <QuickAction icon={UsersIcon} label="멤버" onClick={onOpenMembers} />
            )}
            <QuickAction
              icon={room.muted ? BellOffIcon : BellIcon}
              label="알림"
              onClick={() => setIsNotificationsOpen(true)}
            />
            <QuickAction icon={SearchIcon} label="검색" onClick={onOpenSearch} />
          </div>
        </section>

        <section className="flex flex-col gap-1">
          {room.type === "group" ? (
            <>
              <button
                type="button"
                onClick={onOpenMembers}
                className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2.5 text-left transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <UsersIcon className="text-muted-foreground size-4" aria-hidden="true" />
                  멤버
                </span>
                <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={openRename}
                className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2.5 text-left transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <PencilIcon className="text-muted-foreground size-4" aria-hidden="true" />
                  그룹 이름 변경
                </span>
                <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={onOpenPinnedMessages}
            className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2.5 text-left transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <PinIcon className="text-muted-foreground size-4" aria-hidden="true" />
              고정된 메시지
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onOpenMedia}
            className="hover:bg-muted/60 flex w-full items-center justify-between gap-3 rounded-2xl p-2.5 text-left transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="text-muted-foreground size-4" aria-hidden="true" />
              공유된 미디어
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden="true" />
          </button>
        </section>
      </div>

      <Dialog open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>채팅 알림</DialogTitle>
            <DialogDescription>{room.name} 대화의 알림 방식을 설정합니다.</DialogDescription>
          </DialogHeader>

          <div role="radiogroup" aria-label="채팅 알림" className="flex flex-col gap-1">
            {notificationOptions.map((option) => {
              const selected = Boolean(room.muted) === option.muted
              const Icon = option.icon

              return (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    onMutedChange?.(option.muted)
                    setIsNotificationsOpen(false)
                  }}
                  className="hover:bg-muted flex items-center gap-3 rounded-xl p-3 text-left transition-colors"
                >
                  <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="text-muted-foreground block text-xs">
                      {option.description}
                    </span>
                  </span>
                  {selected ? (
                    <CheckIcon className="text-primary size-5 shrink-0" aria-hidden="true" />
                  ) : null}
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={submitRename} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>그룹 이름 변경</DialogTitle>
              <DialogDescription>새 이름은 이 그룹의 모든 멤버에게 보입니다.</DialogDescription>
            </DialogHeader>

            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              maxLength={100}
              autoFocus
              placeholder="그룹 이름"
              aria-label="그룹 이름"
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  취소
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!isRenameValid}>
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  )
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  to,
  ariaLabel,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  to?: string
  ariaLabel?: string
}) {
  const circleClassName =
    "bg-muted text-foreground hover:bg-muted-foreground/15 focus-visible:ring-ring flex size-9 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"

  return (
    <div className="flex w-16 flex-col items-center gap-1.5">
      {to ? (
        <Link to={to} prefetch="intent" aria-label={ariaLabel ?? label} className={circleClassName}>
          <Icon className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          aria-label={ariaLabel ?? label}
          className={circleClassName}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      )}
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
    </div>
  )
}
