import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useLocation, useNavigate, useParams } from "react-router"

import { ChatListPane } from "~/components/messenger/chat-list-pane"
import { DetailPane } from "~/components/messenger/detail-pane"
import { InviteMembersPane } from "~/components/messenger/invite-members-pane"
import { MembersPane } from "~/components/messenger/members-pane"
import { MessageSearchPane } from "~/components/messenger/message-search-pane"
import { PinnedMessagesPane } from "~/components/messenger/pinned-messages-pane"
import { RoomPane } from "~/components/messenger/room-pane"
import { SharedMediaPane } from "~/components/messenger/shared-media-pane"
import { useIsMobile } from "~/hooks/use-mobile"
import { CURRENT_USER } from "~/lib/messenger/constants"
import {
  getLastMessage,
  getMessageAuthor,
  getReplyText,
  isImageAttachment,
  isDeletedMessage,
  isPinnedMessage,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import { seedRooms } from "../../../docs/messenger-mock-data"
import type {
  Message,
  MessageAttachment,
  ReplyPreview,
  Room,
  RoomSummary,
} from "~/lib/messenger/types"

export const handle = {
  mobileContentPadding: "none",
}

function getRoomSummary(room: Room): RoomSummary {
  const lastMessage = getLastMessage(room)

  return {
    id: room.id,
    type: room.type,
    name: room.name,
    initials: room.initials,
    participants: room.participants,
    unreadCount: room.unreadCount,
    muted: room.muted,
    lastMessage,
    lastMessageAt: lastMessage?.createdAt,
  }
}

function getInitialMessagesByRoomId() {
  return Object.fromEntries(seedRooms.map((room) => [room.id, room.messages]))
}

function updateRoomSummaryMessages(room: RoomSummary, messages: Message[]): RoomSummary {
  return getRoomSummary({ ...room, messages })
}

function readAttachment(file: File, index: number): Promise<MessageAttachment> {
  const baseAttachment: MessageAttachment = {
    id: `local-file-${Date.now()}-${index}`,
    name: file.name,
    contentType: file.type || undefined,
    sizeBytes: file.size,
  }

  if (!file.type.startsWith("image/")) {
    return Promise.resolve(baseAttachment)
  }

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      const src = typeof reader.result === "string" ? reader.result : undefined
      if (!src) {
        resolve(baseAttachment)
        return
      }

      const image = new Image()
      image.addEventListener("load", () => {
        resolve({ ...baseAttachment, src, width: image.naturalWidth, height: image.naturalHeight })
      })
      image.addEventListener("error", () => resolve({ ...baseAttachment, src }))
      image.src = src
    })
    reader.readAsDataURL(file)
  })
}

export default function MessengerPage() {
  const [roomSummaries, setRoomSummaries] = useState<RoomSummary[]>(() =>
    seedRooms.map((room) => getRoomSummary(room))
  )
  const [messagesByRoomId, setMessagesByRoomId] = useState<Record<string, Message[]>>(
    getInitialMessagesByRoomId
  )
  const [searchValue, setSearchValue] = useState("")
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null)
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null)
  const isMobile = useIsMobile()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedRoomIdRef = useRef<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { roomId } = useParams()
  const isDetailOpen = location.pathname.endsWith("/details")
  const isInviteOpen = location.pathname.endsWith("/invite")
  const isMediaOpen = location.pathname.endsWith("/media")
  const isMembersOpen = location.pathname.endsWith("/members")
  const isPinnedOpen = location.pathname.endsWith("/pinned")
  const isSearchOpen = location.pathname.endsWith("/search")
  const selectedRoomId = roomId ?? null

  const normalizedSearchValue = searchValue.trim().toLowerCase()
  const filteredRooms = normalizedSearchValue
    ? roomSummaries.filter((room) => room.name.toLowerCase().includes(normalizedSearchValue))
    : roomSummaries

  const selectedRoomSummary = roomSummaries.find((room) => room.id === selectedRoomId) ?? null
  const selectedRoom = selectedRoomSummary
    ? { ...selectedRoomSummary, messages: messagesByRoomId[selectedRoomSummary.id] ?? [] }
    : null
  const isGroupInviteOpen = isInviteOpen && selectedRoomSummary?.type === "group"
  const isSecondaryOpen =
    isDetailOpen ||
    isGroupInviteOpen ||
    isMediaOpen ||
    isMembersOpen ||
    isPinnedOpen ||
    isSearchOpen

  const getRoomHref = (roomId: string) =>
    isDetailOpen ? `/messenger/${roomId}/details` : `/messenger/${roomId}`

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [selectedRoomId])

  const selectRoom = (roomId: string) => {
    setReplyTo(null)
    setFocusedMessageId(null)
    setRoomSummaries((previousRooms) =>
      previousRooms.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room))
    )
  }

  const clearFocusedMessage = useCallback(() => setFocusedMessageId(null), [])

  const openSearchResult = (messageId: string) => {
    if (!selectedRoom) {
      return
    }

    setFocusedMessageId(messageId)
    navigate(`/messenger/${selectedRoom.id}`)
  }

  const setSelectedRoomMessages = (roomId: string, messages: Message[]) => {
    setMessagesByRoomId((previousMessagesByRoomId) => ({
      ...previousMessagesByRoomId,
      [roomId]: messages,
    }))
    setRoomSummaries((previousRooms) =>
      previousRooms.map((room) =>
        room.id === roomId ? updateRoomSummaryMessages({ ...room, unreadCount: 0 }, messages) : room
      )
    )
  }

  const openReply = (message: Message) => {
    if (!selectedRoom || isDeletedMessage(message)) {
      return
    }
    const author = getMessageAuthor(selectedRoom, message)
    setReplyTo({
      messageId: message.id,
      author: author.name,
      text: getReplyText(message),
    })
  }

  const reactToMessage = (message: Message, reaction: string) => {
    if (!selectedRoom || isDeletedMessage(message)) {
      return
    }

    const nextMessages = selectedRoom.messages.map((candidate) =>
      candidate.id === message.id
        ? {
            ...candidate,
            reactions: candidate.reactions?.some(
              (candidateReaction) => candidateReaction.userId === CURRENT_USER.id
            )
              ? candidate.reactions.map((candidateReaction) =>
                  candidateReaction.userId === CURRENT_USER.id
                    ? { ...candidateReaction, value: reaction }
                    : candidateReaction
                )
              : [...(candidate.reactions ?? []), { userId: CURRENT_USER.id, value: reaction }],
          }
        : candidate
    )

    setSelectedRoomMessages(selectedRoom.id, nextMessages)
  }

  const deleteMessage = (message: Message) => {
    if (!selectedRoom || message.senderId !== CURRENT_USER.id || isDeletedMessage(message)) {
      return
    }

    const nextMessages = selectedRoom.messages.map((candidate) =>
      candidate.id === message.id
        ? {
            ...candidate,
            deletedAt: new Date().toISOString(),
            deletedBy: CURRENT_USER.id,
            pinnedAt: undefined,
            pinnedBy: undefined,
          }
        : candidate
    )

    setSelectedRoomMessages(selectedRoom.id, nextMessages)

    if (replyTo?.messageId === message.id) {
      setReplyTo(null)
    }
  }

  const togglePinMessage = (message: Message) => {
    if (!selectedRoom || isDeletedMessage(message)) {
      return
    }

    const shouldUnpin = isPinnedMessage(message)
    const nextMessages = selectedRoom.messages.map((candidate) =>
      candidate.id === message.id
        ? {
            ...candidate,
            pinnedAt: shouldUnpin ? undefined : new Date().toISOString(),
            pinnedBy: shouldUnpin ? undefined : CURRENT_USER.id,
          }
        : candidate
    )

    setSelectedRoomMessages(selectedRoom.id, nextMessages)
  }

  const sendMessage = (draft: string) => {
    const nextContent = draft.trim()

    if (!selectedRoom || !nextContent) {
      return false
    }

    const now = Date.now()
    const nextMessage: Message = {
      id: `local-${now}-text`,
      senderId: CURRENT_USER.id,
      content: nextContent,
      replyTo: replyTo ?? undefined,
      createdAt: new Date(now).toISOString(),
      read: true,
    }

    setSelectedRoomMessages(selectedRoom.id, [...selectedRoom.messages, nextMessage])
    setReplyTo(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    return true
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.currentTarget.value = ""

    if (!selectedRoom || replyTo || files.length === 0) {
      return
    }

    const targetRoomId = selectedRoom.id
    const attachments = await Promise.all(files.map((file, index) => readAttachment(file, index)))
    if (selectedRoomIdRef.current !== targetRoomId) {
      return
    }

    const now = Date.now()
    const imageAttachments = attachments.filter((attachment) => isImageAttachment(attachment))
    const fileAttachments = attachments.filter((attachment) => !isImageAttachment(attachment))
    const nextMessages: Message[] = []

    // Attachments are sent immediately instead of being previewed in the
    // composer. The message model still separates attachment shapes: images can
    // share one message, while files are always one message per file.
    if (imageAttachments.length > 0) {
      nextMessages.push({
        id: `local-${now}-images`,
        senderId: CURRENT_USER.id,
        attachments: imageAttachments,
        createdAt: new Date(now).toISOString(),
        read: true,
      })
    }

    fileAttachments.forEach((attachment, index) => {
      nextMessages.push({
        id: `local-${now}-file-${index}`,
        senderId: CURRENT_USER.id,
        attachments: [attachment],
        createdAt: new Date(now + nextMessages.length).toISOString(),
        read: true,
      })
    })

    setSelectedRoomMessages(targetRoomId, [...selectedRoom.messages, ...nextMessages])
  }

  if (roomSummaries.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center border border-dashed md:rounded-[1.75rem]">
        <p className="text-muted-foreground text-sm">표시할 대화가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden md:min-h-[32rem] md:rounded-[1.75rem] md:border">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />

      <main className="h-full min-h-0 md:hidden">
        {!selectedRoom ? (
          <ChatListPane
            rooms={filteredRooms}
            selectedRoomId={selectedRoomId}
            searchValue={searchValue}
            getRoomHref={getRoomHref}
            onSearchChange={setSearchValue}
            onSelectRoom={selectRoom}
          />
        ) : null}

        {selectedRoom ? (
          <div className={cn("h-full min-h-0", isSecondaryOpen && "hidden")}>
            <RoomPane
              key={selectedRoom.id}
              room={selectedRoom}
              replyTo={replyTo}
              showBackButton={true}
              onBack={() => navigate("/messenger")}
              onOpenDetail={() => navigate(`/messenger/${selectedRoom.id}/details`)}
              onOpenPinnedMessages={() => navigate(`/messenger/${selectedRoom.id}/pinned`)}
              onAttachFile={() => fileInputRef.current?.click()}
              onClearReply={() => setReplyTo(null)}
              onReply={openReply}
              onReact={reactToMessage}
              onDelete={deleteMessage}
              onTogglePin={togglePinMessage}
              onSend={sendMessage}
              focusedMessageId={isMobile ? focusedMessageId : null}
              onFocusedMessageHandled={isMobile ? clearFocusedMessage : undefined}
            />
          </div>
        ) : null}

        {selectedRoom && isDetailOpen ? (
          <DetailPane
            room={selectedRoom}
            compact={true}
            onBack={() => navigate(`/messenger/${selectedRoom.id}`)}
            onOpenMedia={() => navigate(`/messenger/${selectedRoom.id}/media`)}
            onOpenMembers={() => navigate(`/messenger/${selectedRoom.id}/members`)}
            onOpenPinnedMessages={() => navigate(`/messenger/${selectedRoom.id}/pinned`)}
            onOpenSearch={() => navigate(`/messenger/${selectedRoom.id}/search`)}
          />
        ) : null}

        {selectedRoom && isGroupInviteOpen ? (
          <InviteMembersPane
            compact={true}
            onBack={() => navigate(`/messenger/${selectedRoom.id}/members`)}
          />
        ) : null}

        {selectedRoom && isMediaOpen ? (
          <SharedMediaPane
            room={selectedRoom}
            compact={true}
            onBack={() => navigate(`/messenger/${selectedRoom.id}/details`)}
          />
        ) : null}

        {selectedRoom && isMembersOpen ? (
          <MembersPane
            room={selectedRoom}
            compact={true}
            onBack={() => navigate(`/messenger/${selectedRoom.id}/details`)}
            onInviteMembers={() => navigate(`/messenger/${selectedRoom.id}/invite`)}
          />
        ) : null}

        {selectedRoom && isPinnedOpen ? (
          <PinnedMessagesPane
            room={selectedRoom}
            compact={true}
            onBack={() => navigate(`/messenger/${selectedRoom.id}/details`)}
            onOpenMessage={openSearchResult}
            onUnpinMessage={togglePinMessage}
          />
        ) : null}

        {selectedRoom && isSearchOpen ? (
          <MessageSearchPane
            room={selectedRoom}
            compact={true}
            onBack={() => navigate(`/messenger/${selectedRoom.id}/details`)}
            onOpenMessage={openSearchResult}
          />
        ) : null}
      </main>

      <main
        className={cn(
          "hidden h-full min-h-0 overflow-hidden transition-[grid-template-columns] duration-300 ease-out md:grid",
          isSecondaryOpen
            ? "md:grid-cols-[19.5rem_minmax(0,1fr)] lg:grid-cols-[22.5rem_minmax(0,1fr)_19rem]"
            : "md:grid-cols-[19.5rem_minmax(0,1fr)] lg:grid-cols-[22.5rem_minmax(0,1fr)]"
        )}
      >
        <ChatListPane
          rooms={filteredRooms}
          selectedRoomId={selectedRoomId}
          searchValue={searchValue}
          getRoomHref={getRoomHref}
          onSearchChange={setSearchValue}
          onSelectRoom={selectRoom}
        />

        {selectedRoom ? (
          <>
            <div className={cn("h-full min-h-0", isSecondaryOpen && "hidden lg:block")}>
              <RoomPane
                key={selectedRoom.id}
                room={selectedRoom}
                replyTo={replyTo}
                onOpenDetail={() =>
                  navigate(
                    isSecondaryOpen
                      ? `/messenger/${selectedRoom.id}`
                      : `/messenger/${selectedRoom.id}/details`
                  )
                }
                onOpenPinnedMessages={() => navigate(`/messenger/${selectedRoom.id}/pinned`)}
                onAttachFile={() => fileInputRef.current?.click()}
                onClearReply={() => setReplyTo(null)}
                onReply={openReply}
                onReact={reactToMessage}
                onDelete={deleteMessage}
                onTogglePin={togglePinMessage}
                onSend={sendMessage}
                focusedMessageId={isMobile ? null : focusedMessageId}
                onFocusedMessageHandled={isMobile ? undefined : clearFocusedMessage}
              />
            </div>

            {isDetailOpen ? (
              <DetailPane
                room={selectedRoom}
                onClose={() => navigate(`/messenger/${selectedRoom.id}`)}
                onOpenMedia={() => navigate(`/messenger/${selectedRoom.id}/media`)}
                onOpenMembers={() => navigate(`/messenger/${selectedRoom.id}/members`)}
                onOpenPinnedMessages={() => navigate(`/messenger/${selectedRoom.id}/pinned`)}
                onOpenSearch={() => navigate(`/messenger/${selectedRoom.id}/search`)}
              />
            ) : null}

            {isGroupInviteOpen ? (
              <InviteMembersPane onBack={() => navigate(`/messenger/${selectedRoom.id}/members`)} />
            ) : null}

            {isMediaOpen ? (
              <SharedMediaPane
                room={selectedRoom}
                onBack={() => navigate(`/messenger/${selectedRoom.id}/details`)}
              />
            ) : null}

            {isMembersOpen ? (
              <MembersPane
                room={selectedRoom}
                onBack={() => navigate(`/messenger/${selectedRoom.id}/details`)}
                onInviteMembers={() => navigate(`/messenger/${selectedRoom.id}/invite`)}
              />
            ) : null}

            {isPinnedOpen ? (
              <PinnedMessagesPane
                room={selectedRoom}
                onBack={() => navigate(`/messenger/${selectedRoom.id}/details`)}
                onOpenMessage={openSearchResult}
                onUnpinMessage={togglePinMessage}
              />
            ) : null}

            {isSearchOpen ? (
              <MessageSearchPane
                room={selectedRoom}
                onBack={() => navigate(`/messenger/${selectedRoom.id}/details`)}
                onOpenMessage={openSearchResult}
              />
            ) : null}
          </>
        ) : (
          <div className="flex min-h-[24rem] items-center justify-center">
            <div className="text-muted-foreground text-center text-sm">방을 눌러 채팅하세요.</div>
          </div>
        )}
      </main>
    </div>
  )
}

// TODO: 방 알림기능 스키마 추가
