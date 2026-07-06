import { useRef, useState, type ChangeEvent } from "react"
import { useLocation, useNavigate, useParams } from "react-router"

import { ChatListPane } from "~/components/messenger/chat-list-pane"
import { DetailPane } from "~/components/messenger/detail-pane"
import { RoomPane } from "~/components/messenger/room-pane"
import { CURRENT_USER } from "~/lib/messenger/constants"
import {
  getLastMessage,
  getMessageAuthor,
  getReplyText,
  isDeletedMessage,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import { seedRooms } from "../../docs/messenger-mock-data"
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

export default function MessengerPage() {
  const [roomSummaries, setRoomSummaries] = useState<RoomSummary[]>(() =>
    seedRooms.map((room) => getRoomSummary(room))
  )
  const [messagesByRoomId, setMessagesByRoomId] = useState<Record<string, Message[]>>(
    getInitialMessagesByRoomId
  )
  const [searchValue, setSearchValue] = useState("")
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { roomId } = useParams()
  const isDetailOpen = location.pathname.endsWith("/details")
  const selectedRoomId = roomId ?? null

  const normalizedSearchValue = searchValue.trim().toLowerCase()
  const filteredRooms = normalizedSearchValue
    ? roomSummaries.filter((room) => room.name.toLowerCase().includes(normalizedSearchValue))
    : roomSummaries

  const selectedRoomSummary = roomSummaries.find((room) => room.id === selectedRoomId) ?? null
  const selectedRoom = selectedRoomSummary
    ? { ...selectedRoomSummary, messages: messagesByRoomId[selectedRoomSummary.id] ?? [] }
    : null

  const getRoomHref = (roomId: string) =>
    isDetailOpen ? `/messenger/${roomId}/details` : `/messenger/${roomId}`

  const selectRoom = (roomId: string) => {
    setReplyTo(null)
    setRoomSummaries((previousRooms) =>
      previousRooms.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room))
    )
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
          }
        : candidate
    )

    setSelectedRoomMessages(selectedRoom.id, nextMessages)

    if (replyTo?.messageId === message.id) {
      setReplyTo(null)
    }
  }

  const sendMessage = (draft: string) => {
    const nextContent = draft.trim()

    if (!selectedRoom || !nextContent) {
      return false
    }

    const nextMessage: Message = {
      id: `local-${Date.now()}`,
      senderId: CURRENT_USER.id,
      content: nextContent,
      replyTo: replyTo ?? undefined,
      createdAt: new Date().toISOString(),
      read: true,
    }

    setSelectedRoomMessages(selectedRoom.id, [...selectedRoom.messages, nextMessage])
    setReplyTo(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    return true
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ""

    if (!selectedRoom || replyTo || !file) {
      return
    }

    const sendAttachmentMessage = (src?: string) => {
      const attachment: MessageAttachment = {
        id: `local-file-${Date.now()}`,
        src,
        name: file.name,
        contentType: file.type || undefined,
        sizeBytes: file.size,
      }
      const nextMessage: Message = {
        id: `local-${Date.now()}`,
        senderId: CURRENT_USER.id,
        attachments: [attachment],
        createdAt: new Date().toISOString(),
        read: true,
      }

      setSelectedRoomMessages(selectedRoom.id, [...selectedRoom.messages, nextMessage])
    }

    if (!file.type.startsWith("image/")) {
      sendAttachmentMessage()
      return
    }

    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        sendAttachmentMessage(reader.result)
      }
    })
    reader.readAsDataURL(file)
  }

  if (roomSummaries.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center border border-dashed md:rounded-[1.75rem]">
        <p className="text-muted-foreground text-sm">No conversations available.</p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden md:min-h-[32rem] md:rounded-[1.75rem] md:border">
      <input ref={fileInputRef} type="file" className="sr-only" onChange={handleFileChange} />

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

        {selectedRoom && !isDetailOpen ? (
          <RoomPane
            key={selectedRoom.id}
            room={selectedRoom}
            replyTo={replyTo}
            showBackButton={true}
            onBack={() => navigate("/messenger")}
            onOpenDetail={() => navigate(`/messenger/${selectedRoom.id}/details`)}
            onAttachFile={() => fileInputRef.current?.click()}
            onClearReply={() => setReplyTo(null)}
            onReply={openReply}
            onReact={reactToMessage}
            onDelete={deleteMessage}
            onSend={sendMessage}
          />
        ) : null}

        {selectedRoom && isDetailOpen ? (
          <DetailPane
            room={selectedRoom}
            compact={true}
            onBack={() => navigate(`/messenger/${selectedRoom.id}`)}
          />
        ) : null}
      </main>

      <main
        className={cn(
          "hidden h-full min-h-0 overflow-hidden transition-[grid-template-columns] duration-300 ease-out md:grid",
          isDetailOpen
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
            <div className={cn("h-full min-h-0", isDetailOpen && "hidden lg:block")}>
              <RoomPane
                key={selectedRoom.id}
                room={selectedRoom}
                replyTo={replyTo}
                onOpenDetail={() =>
                  navigate(
                    isDetailOpen
                      ? `/messenger/${selectedRoom.id}`
                      : `/messenger/${selectedRoom.id}/details`
                  )
                }
                onAttachFile={() => fileInputRef.current?.click()}
                onClearReply={() => setReplyTo(null)}
                onReply={openReply}
                onReact={reactToMessage}
                onDelete={deleteMessage}
                onSend={sendMessage}
              />
            </div>

            {isDetailOpen ? (
              <DetailPane
                room={selectedRoom}
                onClose={() => navigate(`/messenger/${selectedRoom.id}`)}
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
