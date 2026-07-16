import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router"

import { FileDropOverlay } from "~/components/file-drop-overlay"
import { ImageViewer } from "~/components/media/image-viewer"
import { ChatListPane } from "~/components/messenger/chat-list-pane"
import { DetailPane } from "~/components/messenger/detail-pane"
import { InviteMembersPane } from "~/components/messenger/invite-members-pane"
import { MembersPane } from "~/components/messenger/members-pane"
import { MessageSearchPane } from "~/components/messenger/message-search-pane"
import { PinnedMessagesPane } from "~/components/messenger/pinned-messages-pane"
import { RoomPane } from "~/components/messenger/room-pane"
import { SharedMediaPane } from "~/components/messenger/shared-media-pane"
import { useFileDrop } from "~/hooks/use-file-drop"
import { useIsMobile } from "~/hooks/use-mobile"
import {
  CURRENT_USER,
  PHOTO_SEARCH_PARAM,
  type PhotoViewerLocationState,
} from "~/lib/messenger/constants"
import { seedRooms } from "~/lib/messenger/mock-data"
import { PLACEHOLDER_REACTION_TYPES } from "~/lib/reactions"
import {
  getAttachmentKind,
  getLastMessage,
  getMessageAuthor,
  getMessageImages,
  getReplyText,
  isImageAttachment,
  isDeletedMessage,
  isPinnedMessage,
} from "~/lib/messenger/utils"
import { cn } from "~/lib/utils"
import type {
  Message,
  MessageAttachment,
  MessageStatus,
  ReplyPreview,
  Room,
  RoomSummary,
} from "~/lib/messenger/types"

export const handle = {
  mobileScroll: "self",
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

function readImageSize(src: string) {
  return new Promise<{ width?: number; height?: number }>((resolve) => {
    const image = new Image()
    image.addEventListener("load", () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    )
    image.addEventListener("error", () => resolve({}))
    image.src = src
  })
}

function readAudioDuration(src: string) {
  return new Promise<number | undefined>((resolve) => {
    const audio = new Audio()
    audio.preload = "metadata"
    audio.addEventListener("loadedmetadata", () =>
      resolve(Number.isFinite(audio.duration) ? audio.duration : undefined)
    )
    audio.addEventListener("error", () => resolve(undefined))
    audio.src = src
  })
}

function readVideoMetadata(src: string) {
  return new Promise<{ width?: number; height?: number; durationSeconds?: number }>((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.addEventListener("loadedmetadata", () =>
      resolve({
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined,
      })
    )
    video.addEventListener("error", () => resolve({}))
    video.src = src
  })
}

// Object URLs rather than base64 data URLs: an mp3 read with readAsDataURL
// would sit in React state a third larger than the file itself. The caller owns
// revoking the returned src.
async function readAttachment(file: File, index: number): Promise<MessageAttachment> {
  const baseAttachment: MessageAttachment = {
    id: `local-file-${Date.now()}-${index}`,
    name: file.name,
    contentType: file.type || undefined,
    sizeBytes: file.size,
  }

  const kind = getAttachmentKind(baseAttachment)

  if (kind === "file") {
    return baseAttachment
  }

  const src = URL.createObjectURL(file)

  if (kind === "image") {
    return { ...baseAttachment, src, ...(await readImageSize(src)) }
  }

  if (kind === "video") {
    return { ...baseAttachment, src, ...(await readVideoMetadata(src)) }
  }

  return { ...baseAttachment, src, durationSeconds: await readAudioDuration(src) }
}

// 전송 실패/성공 UX용 mock. 실제 전송(압축 -> 업로드 -> send RPC)이 들어갈 자리다. 지금은 잠깐
// 지연 후 성공하되, 본문이나 파일명에 "fail"이 들어가면 실패시켜 재시도 흐름을 눌러볼 수 있게 한다.
const MOCK_SEND_DELAY_MS = 700
function mockPerformSend(message: Message): Promise<void> {
  const haystack = [
    message.content,
    ...(message.attachments?.map((attachment) => attachment.name) ?? []),
  ]
    .join(" ")
    .toLowerCase()

  return new Promise((resolve, reject) => {
    setTimeout(
      () => (haystack.includes("fail") ? reject(new Error("mock send failure")) : resolve()),
      MOCK_SEND_DELAY_MS
    )
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
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedRoomIdRef = useRef<string | null>(null)
  const objectUrlsRef = useRef<string[]>([])
  // 실패한 전송의 재시도 thunk. 메시지의 임시 id로 키를 잡는다 -- 재시도에 필요한 것(파일/본문/방)을
  // 클로저가 붙들고 있어, Message는 순수 데이터로 남는다.
  const pendingSendsRef = useRef(new Map<string, () => void>())
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const openPhotoId = searchParams.get(PHOTO_SEARCH_PARAM)
  const viewerImages =
    selectedRoom && openPhotoId
      ? getMessageImages(selectedRoom, openPhotoId).map(({ id, src, name }) => ({ id, src, name }))
      : []
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

    if (imageInputRef.current) {
      imageInputRef.current.value = ""
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [selectedRoomId])

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
    },
    []
  )

  // The search param only records that the viewer is open, and on which photo.
  // Moving between photos afterwards is the viewer's own business: a router
  // round trip per swipe would land back here mid-gesture and fight the finger.
  //
  // PhotoLink pushes a marked history entry, so closing steps back and the
  // mobile back gesture closes the viewer too. A deep link is not ours to step
  // back from, so that entry is unmarked and gets the param stripped instead.
  const isPushedPhotoEntry = Boolean(
    (location.state as PhotoViewerLocationState | null)?.photoViewerPushed
  )
  const closePhotoViewer = useCallback(() => {
    if (isPushedPhotoEntry) {
      navigate(-1)
      return
    }

    setSearchParams(
      (previousSearchParams) => {
        const nextSearchParams = new URLSearchParams(previousSearchParams)
        nextSearchParams.delete(PHOTO_SEARCH_PARAM)
        return nextSearchParams
      },
      { replace: true, preventScrollReset: true }
    )
  }, [isPushedPhotoEntry, navigate, setSearchParams])

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

  // 특정 방의 특정 메시지 status만 갱신한다. 전체 배열 교체(setSelectedRoomMessages)와 달리 함수형
  // 업데이트라, 전송 중에 방을 바꾸거나 여러 전송이 겹쳐도 항상 최신 상태 위에 안전하게 얹힌다.
  const patchMessageStatus = (
    roomId: string,
    messageId: string,
    status: MessageStatus | undefined
  ) => {
    setMessagesByRoomId((previous) => {
      const list = previous[roomId]
      if (!list) {
        return previous
      }

      return {
        ...previous,
        [roomId]: list.map((message) =>
          message.id === messageId ? { ...message, status } : message
        ),
      }
    })
  }

  // 낙관적 전송의 코어. perform이 실제 전송(압축 -> 업로드 -> send RPC) 자리다. 성공하면 status를
  // 지워 "전달됨"으로, 실패하면 "failed"로 두고 재시도 thunk를 붙든다. 재시도는 이 함수를 다시 탄다.
  const runSend = (roomId: string, messageId: string, perform: () => Promise<void>) => {
    perform()
      .then(() => {
        pendingSendsRef.current.delete(messageId)
        // 실제 배선 때는 여기서 임시 메시지를 서버 응답(진짜 id/createdAt)으로 교체한다.
        patchMessageStatus(roomId, messageId, undefined)
      })
      .catch(() => {
        pendingSendsRef.current.set(messageId, () => {
          patchMessageStatus(roomId, messageId, "sending")
          runSend(roomId, messageId, perform)
        })
        patchMessageStatus(roomId, messageId, "failed")
      })
  }

  const retryMessage = (message: Message) => {
    pendingSendsRef.current.get(message.id)?.()
  }

  const sendMessage = (draft: string) => {
    const nextContent = draft.trim()

    if (!selectedRoom || !nextContent) {
      return false
    }

    const roomId = selectedRoom.id
    const now = Date.now()
    const nextMessage: Message = {
      id: `local-${now}-text`,
      senderId: CURRENT_USER.id,
      content: nextContent,
      replyTo: replyTo ?? undefined,
      createdAt: new Date(now).toISOString(),
      read: true,
      status: "sending",
    }

    setSelectedRoomMessages(roomId, [...selectedRoom.messages, nextMessage])
    runSend(roomId, nextMessage.id, () => mockPerformSend(nextMessage))
    setReplyTo(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    return true
  }

  // 파일 선택(input)과 드래그드롭이 공유하는 전송 코어. 답장 중이거나 방이 없으면 무시.
  const sendFiles = async (files: File[]) => {
    if (!selectedRoom || replyTo || files.length === 0) {
      return
    }

    const targetRoomId = selectedRoom.id
    const attachments = await Promise.all(files.map((file, index) => readAttachment(file, index)))
    const objectUrls = attachments
      .map((attachment) => attachment.src)
      .filter((src): src is string => Boolean(src?.startsWith("blob:")))

    // The room changed while we were reading the files, so these attachments
    // are thrown away. Release their object URLs now rather than at unmount.
    if (selectedRoomIdRef.current !== targetRoomId) {
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
      return
    }

    objectUrlsRef.current.push(...objectUrls)

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
        status: "sending",
      })
    }

    fileAttachments.forEach((attachment, index) => {
      nextMessages.push({
        id: `local-${now}-file-${index}`,
        senderId: CURRENT_USER.id,
        attachments: [attachment],
        createdAt: new Date(now + nextMessages.length).toISOString(),
        read: true,
        status: "sending",
      })
    })

    setSelectedRoomMessages(targetRoomId, [...selectedRoom.messages, ...nextMessages])
    nextMessages.forEach((message) =>
      runSend(targetRoomId, message.id, () => mockPerformSend(message))
    )
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    // input.value를 비우면 FileList가 초기화되므로, 리셋 전에 배열로 복사해 넘긴다.
    const files = Array.from(event.target.files ?? [])
    event.currentTarget.value = ""
    void sendFiles(files)
  }

  // 데스크톱에서 대화 영역으로 파일을 끌어다 놓으면 현재 방에 바로 전송한다.
  const { isDragging, dropHandlers } = useFileDrop((list) => void sendFiles(Array.from(list ?? [])))
  const showDropOverlay = isDragging && Boolean(selectedRoom) && !replyTo

  if (roomSummaries.length === 0) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center border border-dashed md:rounded-[1.75rem]">
        <p className="text-muted-foreground text-sm">표시할 대화가 없습니다.</p>
      </div>
    )
  }

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden md:min-h-[32rem] md:rounded-[1.75rem] md:border"
      {...dropHandlers}
    >
      {showDropOverlay ? <FileDropOverlay label="여기에 놓아 전송하기" /> : null}

      {/* 사진과 파일 첨부를 분리한다 -- accept="image/*"는 모바일에서 갤러리·카메라를,
          일반 입력은 파일 브라우저를 연다. 선택 후 처리는 handleFileChange가 공통으로. */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={handleFileChange}
      />

      <ImageViewer images={viewerImages} openImageId={openPhotoId} onClose={closePhotoViewer} />

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
              reactionTypes={PLACEHOLDER_REACTION_TYPES}
              replyTo={replyTo}
              showBackButton={true}
              onBack={() => navigate("/messenger")}
              onOpenDetail={() => navigate(`/messenger/${selectedRoom.id}/details`)}
              onOpenPinnedMessages={() => navigate(`/messenger/${selectedRoom.id}/pinned`)}
              onAttachImage={() => imageInputRef.current?.click()}
              onAttachFile={() => fileInputRef.current?.click()}
              onClearReply={() => setReplyTo(null)}
              onReply={openReply}
              onReact={reactToMessage}
              onDelete={deleteMessage}
              onTogglePin={togglePinMessage}
              onRetry={retryMessage}
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
                reactionTypes={PLACEHOLDER_REACTION_TYPES}
                replyTo={replyTo}
                onOpenDetail={() =>
                  navigate(
                    isSecondaryOpen
                      ? `/messenger/${selectedRoom.id}`
                      : `/messenger/${selectedRoom.id}/details`
                  )
                }
                onOpenPinnedMessages={() => navigate(`/messenger/${selectedRoom.id}/pinned`)}
                onAttachImage={() => imageInputRef.current?.click()}
                onAttachFile={() => fileInputRef.current?.click()}
                onClearReply={() => setReplyTo(null)}
                onReply={openReply}
                onReact={reactToMessage}
                onDelete={deleteMessage}
                onTogglePin={togglePinMessage}
                onRetry={retryMessage}
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
