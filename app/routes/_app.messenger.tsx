import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { useLocation, useNavigate, useParams } from "react-router"

import { ChatListPane } from "~/components/messenger/chat-list-pane"
import { DetailPane } from "~/components/messenger/detail-pane"
import { RoomPane } from "~/components/messenger/room-pane"
import { CURRENT_USER } from "~/lib/messenger/constants"
import {
  getDesktopGridClass,
  getMessageAuthor,
  getReplyText,
  isDeletedMessage,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import { seedRooms } from "../../docs/messenger-mock-data"
import type { ImageAttachment, Message, ReplyPreview } from "~/lib/messenger/types"

export const handle = {
  mobileContentPadding: "none",
}

export default function MessengerPage() {
  const [rooms, setRooms] = useState(seedRooms)
  const [searchValue, setSearchValue] = useState("")
  const [attachedImage, setAttachedImage] = useState<ImageAttachment | null>(null)
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { roomId } = useParams()
  const isDetailOpen = location.pathname.endsWith("/details")
  const selectedRoomId = roomId ?? null

  const filteredRooms = useMemo(() => {
    const normalizedSearchValue = searchValue.trim().toLowerCase()
    if (!normalizedSearchValue) {
      return rooms
    }

    return rooms.filter((room) => room.name.toLowerCase().includes(normalizedSearchValue))
  }, [rooms, searchValue])

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null

  const selectRoom = (roomId: string) => {
    setReplyTo(null)
    setAttachedImage(null)
    setRooms((previousRooms) =>
      previousRooms.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room))
    )
    navigate(isDetailOpen ? `/messenger/${roomId}/details` : `/messenger/${roomId}`)
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

    setRooms((previousRooms) =>
      previousRooms.map((room) =>
        room.id === selectedRoom.id
          ? {
              ...room,
              messages: room.messages.map((candidate) =>
                candidate.id === message.id ? { ...candidate, reaction } : candidate
              ),
            }
          : room
      )
    )
  }

  const deleteMessage = (message: Message) => {
    if (!selectedRoom || message.senderId !== CURRENT_USER.id || isDeletedMessage(message)) {
      return
    }

    setRooms((previousRooms) =>
      previousRooms.map((room) =>
        room.id === selectedRoom.id
          ? {
              ...room,
              messages: room.messages.map((candidate) =>
                candidate.id === message.id
                  ? {
                      ...candidate,
                      deletedAt: new Date().toISOString(),
                      deletedBy: CURRENT_USER.id,
                    }
                  : candidate
              ),
            }
          : room
      )
    )

    if (replyTo?.messageId === message.id) {
      setReplyTo(null)
    }
  }

  const sendMessage = (draft: string) => {
    const nextContent = draft.trim()

    if (!selectedRoom || (!nextContent && !attachedImage)) {
      return false
    }

    const nextMessage: Message = {
      id: `local-${Date.now()}`,
      senderId: CURRENT_USER.id,
      content: nextContent || undefined,
      image: attachedImage ?? undefined,
      replyTo: replyTo ?? undefined,
      createdAt: new Date().toISOString(),
      read: true,
    }

    setRooms((previousRooms) =>
      previousRooms.map((room) =>
        room.id === selectedRoom.id
          ? { ...room, messages: [...room.messages, nextMessage], unreadCount: 0 }
          : room
      )
    )
    setAttachedImage(null)
    setReplyTo(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    return true
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        return
      }

      setAttachedImage({
        src: reader.result,
        title: file.name,
        subtitle: `${Math.max(1, Math.round(file.size / 1024))} KB`,
      })
    })
    reader.readAsDataURL(file)
  }

  if (rooms.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center border border-dashed md:rounded-[1.75rem]">
        <p className="text-muted-foreground text-sm">No conversations available.</p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-hidden md:min-h-[32rem] md:rounded-[1.75rem] md:border">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
      />

      <main className="h-full min-h-0 md:hidden">
        {!selectedRoom ? (
          <ChatListPane
            rooms={filteredRooms}
            selectedRoomId={selectedRoomId}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            onSelectRoom={selectRoom}
          />
        ) : null}

        {selectedRoom && !isDetailOpen ? (
          <RoomPane
            key={selectedRoom.id}
            room={selectedRoom}
            attachedImage={attachedImage}
            replyTo={replyTo}
            showBackButton={true}
            onBack={() => navigate("/messenger")}
            onOpenDetail={() => navigate(`/messenger/${selectedRoom.id}/details`)}
            onAttachImage={() => fileInputRef.current?.click()}
            onRemoveImage={() => setAttachedImage(null)}
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
          getDesktopGridClass(isDetailOpen)
        )}
      >
        <ChatListPane
          rooms={filteredRooms}
          selectedRoomId={selectedRoomId}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onSelectRoom={selectRoom}
        />

        {selectedRoom ? (
          <>
            <div className={cn("h-full min-h-0", isDetailOpen && "hidden lg:block")}>
              <RoomPane
                key={selectedRoom.id}
                room={selectedRoom}
                attachedImage={attachedImage}
                replyTo={replyTo}
                onOpenDetail={() =>
                  navigate(
                    isDetailOpen
                      ? `/messenger/${selectedRoom.id}`
                      : `/messenger/${selectedRoom.id}/details`
                  )
                }
                onAttachImage={() => fileInputRef.current?.click()}
                onRemoveImage={() => setAttachedImage(null)}
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
