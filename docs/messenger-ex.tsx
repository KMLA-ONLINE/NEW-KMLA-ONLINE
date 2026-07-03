import * as React from "react"
import { ArrowLeft, Info, Menu, PanelRightClose, Users } from "lucide-react"
import type { AvatarProps } from "../../atoms"
import { Avatar, Button, FileChip, IconButton, ImageThumb, Textarea } from "../../atoms"
import { EmptyState } from "../../cross-cutting"
import type { MessageBubbleFile } from "../../molecules"
import { ChatRoomItem, MediaAttachBar, SearchBar } from "../../molecules"
import type { MessageThreadMessage, MessageThreadProps } from "../../organisms"
import { MessageThread, PageHeader } from "../../organisms"

type MobileScreen = "list" | "room" | "detail"
type RoomType = "direct" | "group"

const MESSAGE_PAGE_HISTORY_SCREEN_KEY = "__minUiMessagePageScreen"

interface RoomParticipant {
  id: string
  name: string
  avatar?: Omit<AvatarProps, "ref">
}

interface MediaPreviewItem {
  id: string
  src: string
  alt: string
}

interface MessageRoom {
  id: string
  type: RoomType
  name: string
  preview: string
  time: Date | string | number
  unreadCount?: number
  isOnline?: boolean
  avatar?: Omit<AvatarProps, "ref">
  participants: RoomParticipant[]
  messages: MessageThreadProps["messages"]
  mediaPreview?: MediaPreviewItem[]
  filePreview?: MessageBubbleFile[]
  statusNote?: string
}

export type MessagePageProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children">

const CURRENT_USER_ID = "me"

const getMessagePageHistoryScreen = (): MobileScreen | null => {
  if (typeof window === "undefined") {
    return null
  }

  const state = window.history.state
  if (!state || typeof state !== "object") {
    return null
  }

  const screen = (state as Record<string, unknown>)[MESSAGE_PAGE_HISTORY_SCREEN_KEY]

  return screen === "list" || screen === "room" || screen === "detail" ? screen : null
}

const setMessagePageHistoryScreen = (screen: MobileScreen, mode: "push" | "replace") => {
  if (typeof window === "undefined") {
    return
  }

  const state = window.history.state
  const nextState = {
    ...(state && typeof state === "object" ? state : {}),
    [MESSAGE_PAGE_HISTORY_SCREEN_KEY]: screen,
  }

  if (mode === "push") {
    window.history.pushState(nextState, "", window.location.href)
    return
  }

  window.history.replaceState(nextState, "", window.location.href)
}

const createMockImage = (from: string, to: string, accent: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 720">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${from}"/>
          <stop offset="1" stop-color="${to}"/>
        </linearGradient>
      </defs>
      <rect width="720" height="720" fill="url(#bg)"/>
      <circle cx="560" cy="150" r="110" fill="${accent}" opacity=".56"/>
      <path d="M78 560 252 340l110 124 78-88 198 184H78z" fill="#fff" opacity=".42"/>
      <rect x="104" y="110" width="228" height="136" rx="22" fill="#fff" opacity=".18"/>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const buildMessages = (
  roomId: string,
  sender: RoomParticipant,
  ownSender: RoomParticipant
): MessageThreadMessage[] => {
  switch (roomId) {
    case "nari-thread":
      return [
        {
          id: "nari-1",
          sender,
          content: "최신 모션 시안을 공유 폴더에 올려뒀어.",
          time: new Date("2026-05-15T08:54:00"),
        },
        {
          id: "nari-2",
          sender,
          content: "점심 전에 헤드라인 간격만 한번 봐줄래?",
          time: new Date("2026-05-15T08:55:00"),
        },
        {
          id: "nari-3",
          sender: ownSender,
          content: "응. 데스크톱이랑 모바일 둘 다 보고 코멘트 남길게.",
          time: new Date("2026-05-15T08:57:00"),
        },
        {
          id: "nari-4",
          sender: ownSender,
          image: createMockImage("#1d4ed8", "#38bdf8", "#facc15"),
          time: new Date("2026-05-15T08:58:00"),
          metaLabel: "읽음",
        },
        {
          id: "nari-5",
          sender,
          content:
            "?꾩쭏 ?덈젮以??쒖븞? 鍮꾧탳?섎㈃ ??댄룷媛??ъ슂??源뚯? ?댁빞湲??섍린 醫뗭쓣 寃?媛숈븘.",
          time: new Date("2026-05-15T08:59:00"),
        },
        {
          id: "nari-6",
          sender,
          content: "?뚯씠?먮뿉???띿뒪?멸? ?덈Ц ?꾨줈 ?꾩쟾?뚮떎 蹂댁씠?는吏?議곌툑 ?걹由?騌댁꽌.",
          time: new Date("2026-05-15T09:00:00"),
        },
        {
          id: "nari-7",
          sender: ownSender,
          content:
            "癒쇱? 媛꾧꺽?쒕? 諛붽퓭蹂닿퀬, ?ㅻⅨ ?띿뒪?몄씠?꾧컙? ?ㅼ떆 諛욌뒗?곸쑝濡??댄꽥?댄븷寃?.",
          time: new Date("2026-05-15T09:01:00"),
        },
        {
          id: "nari-8",
          sender,
          content:
            "醫뗭븘. ?ㅽ겕濡ㅽ뻽???꾨뒗 寃쎌슦? 媛숈씠 蹂대㈃ ?띿쓣寃?媛숈븘. ?먮챸?먯꽌 媛뚮옉?붾뒗遺遺꾨룄 ?덉뼱.",
          time: new Date("2026-05-15T09:02:00"),
        },
        {
          id: "nari-9",
          sender: ownSender,
          content:
            "?쒖븘. 諛묓렐 嫄곕줈 ?붾㈃ ?대줈?꾧껐 ?곹깭?앹뿉??願듭갚 媛??닿쾶 ?ㅻⅨ 諛섏쭅?꾨룄 蹂쇨쾶.",
          time: new Date("2026-05-15T09:03:00"),
        },
        {
          id: "nari-10",
          sender,
          content:
            "?꾩씠??紐⑥뀡? ?대줈 ?먯뿰?ㅻ윭??醫뗭쓣 ?뱀븘. ?섏젙??援먯껜 ?댄뒪?몄? ?덉쑝硫?踰꾪듉?먯꽌 洹몄묘 ?쎄꽦?댁쓣 ?듯빐 ?먮룄 ?대윭??",
          time: new Date("2026-05-15T09:04:00"),
        },
        {
          id: "nari-11",
          sender: ownSender,
          content: "湲곕뒫?꾨뒗 洹몃?濡??섏퀜?섍퀬, ?쒖꽑??遺덊슂??媛뺤“?쒕쭔 以꾩씠?곕줈 媛?寃?.",
          time: new Date("2026-05-15T09:05:00"),
        },
        {
          id: "nari-12",
          sender,
          content:
            "洹?李⑤뀒?먯꽌 ?ㅻⅨ 諛붾찘?묒엫? ?좉꼍?댁꽦 怨좊뒗?쇰뜲, ?뚮즺?섎㈃ ?ㅽ겕由샿 ???꾩옒?먯쑝濡??섎궡以?二쇨쾶.",
          time: new Date("2026-05-15T09:06:00"),
        },
        {
          id: "nari-13",
          sender: ownSender,
          content:
            "?깅??좎슜?덉쓣 寃??숈?諛?濡쒖쬆?댁뒪?덉씠 ?덈Ц ?묎렐?댁쁽?대떦?쇱? ?뺤씤?댄븷寃?.",
          time: new Date("2026-05-15T09:07:00"),
        },
        {
          id: "nari-14",
          sender,
          content:
            "?숈꽕. 洹몃━怨?由ъ뒪?몃룄 ?섎굹??沅덉뿭?좎쭨?먯꽌 寃깆쾶 ???좎졊??湲곕컮?댁뒗 寃?醫뗭쓣 紐삵퇋.",
          time: new Date("2026-05-15T09:08:00"),
        },
        {
          id: "nari-15",
          sender: ownSender,
          content:
            "濡쒓렇?꾩씤?댁꽦 諛곌꼍? ?щ씪?섏씠 ?꾧굅?섎떎 怨좊젮?댁꽌 ?섎떒 ?щ갚?먮룄 醫낆씠寃?留욌텧寃?.",
          time: new Date("2026-05-15T09:09:00"),
        },
        {
          id: "nari-16",
          sender,
          content:
            "?댁쟾 踰꾩쟾蹂대떎 ?훨? 나?硫?醫뗭븘. ?ㅽ겕濡ㅻ? 諛쏄쾶 ?댁긽?섏? ?딆븘?도 먮뒗寃껋룄 ?뺤씤 ???덈떎.",
          time: new Date("2026-05-15T09:10:00"),
        },
        {
          id: "nari-17",
          sender: ownSender,
          content:
            "?쒓컙 ?쎈즺??諛붽퓭??UI諛붾꽕?곗꽌 ?좏깮?쇱쑝濡?蹂대궡蹂쇨쾶. ?ㅻⅨ 肄붾찘?몄? ?덉쑝硫?洹몃븣 ?댁뼱??",
          time: new Date("2026-05-15T09:11:00"),
        },
        {
          id: "nari-18",
          sender,
          content:
            "醫뗭븘. 洹몃윭硫?硫붿떆吏 ?곸뿭??諛곗쁺?꾨룄 議곌툑 ?먮뒗 醫뗭쓣 ?듯븳?????ㅻ뒗 怨듬갚?쒖씠 寃쎌쾶 醫뗭븘.",
          time: new Date("2026-05-15T09:12:00"),
        },
        {
          id: "nari-19",
          sender: ownSender,
          content:
            "諛⑸뒿 諛섏쁺?댄븯怨??ㅼ떆 蹂대궪寃?. ?섎줈?ㅻ룄 ?ㅽ겕濡?媛 ?섎룄濡?湲몄씠?볥쾶 留욎텿?⑤떎.",
          time: new Date("2026-05-15T09:13:00"),
        },
        {
          id: "nari-20",
          sender,
          content: "?욌뼱. 洹?踰꾩쟾湲곕컲?쇰줈 ?ㅽ겕濡?媛??덈뒗吏? 蹂대윭媛덈㈃ ???덈룄?덈떎.",
          time: new Date("2026-05-15T09:14:00"),
        },
        {
          id: "nari-21",
          sender: ownSender,
          content:
            "?ㅻⅨ ?꾩젙 臾몄옄?꾩씠?먯꽌 媛꾨떒?섍쾶 ?꾩뿬?④꽌 ?붾㈃?먯꽌 諛붾줈 ?뺤씤?댄븷 ???덉쑝硫?醫뗭쓣 寃?媛숈븘.",
          time: new Date("2026-05-15T09:15:00"),
        },
        {
          id: "nari-22",
          sender: ownSender,
          content:
            "?앹뾽?쒕룄 ?쇳슚?섍쾶 ?ㅼ뼱媛고퀎 ?먯젙?댁빞?섎땲, ?ㅻ뒫 諛곗뿴?쒕룄 ?쒕쾲 蹂?寃곕랬?댁꽌 ?ㅼ떆 蹂대궪寃?.",
          time: new Date("2026-05-15T09:16:00"),
          metaLabel: "?쎌쓬",
        },
      ]
    case "atlas-thread":
      return [
        {
          id: "atlas-1",
          sender,
          content: "아젠다는 확정됐고, 도입 문구만 조금 더 깔끔하면 돼.",
          time: new Date("2026-05-15T09:11:00"),
        },
        {
          id: "atlas-2",
          sender: ownSender,
          replyTo: {
            name: sender.name,
            content: "아젠다는 확정됐고, 도입 문구만 조금 더 깔끔하면 돼.",
          },
          content: "좋아. 너무 딱딱하지 않게 다시 정리해볼게.",
          time: new Date("2026-05-15T09:13:00"),
        },
        {
          id: "atlas-3",
          sender: ownSender,
          file: {
            name: "project-kickoff-notes.pdf",
            size: 1024 * 512,
          },
          time: new Date("2026-05-15T09:14:00"),
          metaLabel: "읽음",
        },
      ]
    case "min-thread":
      return [
        {
          id: "min-1",
          sender,
          content: "리크루터 답장 왔어. 최종 검토는 내일이래.",
          time: new Date("2026-05-15T10:02:00"),
        },
        {
          id: "min-2",
          sender: ownSender,
          content: "좋네. 수업 끝나고 같이 리허설해보자.",
          time: new Date("2026-05-15T10:04:00"),
          metaLabel: "전달됨",
        },
      ]
    default:
      return [
        {
          id: "crew-1",
          sender,
          content: "샷리스트 업데이트했어. 장면은 더 늘리지 않는 쪽으로 가자.",
          time: new Date("2026-05-15T11:16:00"),
        },
        {
          id: "crew-2",
          sender: {
            id: "hyun",
            name: "현서",
          },
          content: "인트로에는 클로즈업 한 컷만 있으면 될 것 같아.",
          time: new Date("2026-05-15T11:18:00"),
        },
        {
          id: "crew-3",
          sender: ownSender,
          content: "알겠어. 스토리보드 정리해서 다시 보낼게.",
          time: new Date("2026-05-15T11:20:00"),
        },
        {
          id: "crew-4",
          sender,
          time: new Date("2026-05-15T11:21:00"),
          isDeleted: true,
        },
      ]
  }
}

const createScrollTestRooms = (owner: RoomParticipant): MessageRoom[] => {
  const names = [
    "가온",
    "도윤",
    "서아",
    "지후",
    "하린",
    "이준",
    "유나",
    "시우",
    "채원",
    "준서",
    "다은",
    "태오",
    "수아",
    "현우",
    "예린",
    "민재",
    "나은",
    "우진",
    "소율",
    "지안",
    "서준",
    "아린",
    "은우",
    "로아",
    "윤재",
    "리아",
    "건우",
    "세아",
    "도하",
    "하윤",
    "태린",
    "지오",
    "유준",
    "서윤",
    "민준",
    "하람",
  ]

  return names.map((name, index) => ({
    id: `scroll-test-room-${index + 1}`,
    type: "direct",
    name,
    preview: "채팅방 목록 스크롤 테스트용 대화입니다.",
    time: new Date(2026, 4, 15, 12, index),
    unreadCount: index % 5 === 0 ? index + 1 : undefined,
    isOnline: index % 3 === 0,
    avatar: { fallback: name },
    participants: [{ id: `scroll-test-user-${index + 1}`, name }, owner],
    statusNote: index % 3 === 0 ? "지금 활동 중" : "최근 접속",
    messages: [],
  }))
}

const createMockRooms = (): MessageRoom[] => {
  const me: RoomParticipant = { id: CURRENT_USER_ID, name: "나" }
  const nari: RoomParticipant = { id: "nari", name: "나리" }
  const atlas: RoomParticipant = { id: "atlas", name: "아틀라스 PM" }
  const min: RoomParticipant = { id: "min", name: "민서" }
  const crew: RoomParticipant = { id: "crew-lead", name: "영상팀" }

  const rooms: MessageRoom[] = [
    {
      id: "room-nari",
      type: "direct",
      name: "나리",
      preview: "내일도 스크롤 확인할 수 있게 메시지 길이 충분히 채워둘게.",
      time: new Date("2026-05-15T09:16:00"),
      unreadCount: 2,
      isOnline: true,
      avatar: { fallback: "나리" },
      participants: [nari],
      statusNote: "지금 활동 중",
      messages: buildMessages("nari-thread", nari, me),
      mediaPreview: [
        {
          id: "nari-media-1",
          src: createMockImage("#2563eb", "#38bdf8", "#fbbf24"),
          alt: "모션 보드 미리보기",
        },
        {
          id: "nari-media-2",
          src: createMockImage("#0f766e", "#5eead4", "#f8fafc"),
          alt: "UI 레이아웃 미리보기",
        },
        {
          id: "nari-media-3",
          src: createMockImage("#7c3aed", "#c4b5fd", "#f9a8d4"),
          alt: "컬러 시안 미리보기",
        },
      ],
      filePreview: [
        { name: "헤드라인-간격-메모.fig" },
        { name: "motion-pass-v4.mp4", size: 1024 * 1024 * 8 },
      ],
    },
    {
      id: "room-atlas",
      type: "group",
      name: "프로젝트 아틀라스",
      preview: "좋아. 너무 딱딱하지 않게 다시 정리해볼게.",
      time: new Date("2026-05-15T09:14:00"),
      unreadCount: 4,
      avatar: { fallback: "프로젝트 아틀라스" },
      participants: [atlas, { id: "jiwon", name: "지원" }, me],
      statusNote: "3명",
      messages: buildMessages("atlas-thread", atlas, me),
      mediaPreview: [
        {
          id: "atlas-media-1",
          src: createMockImage("#1f2937", "#475569", "#f472b6"),
          alt: "킥오프 보드 미리보기",
        },
        {
          id: "atlas-media-2",
          src: createMockImage("#b45309", "#f59e0b", "#fef3c7"),
          alt: "워크숍 사진 미리보기",
        },
      ],
      filePreview: [
        { name: "프로젝트-킥오프-노트.pdf", size: 1024 * 512 },
        { name: "범위-정렬.docx", size: 1024 * 128 },
      ],
    },
    {
      id: "room-min",
      type: "direct",
      name: "민서",
      preview: "리크루터 답장 왔어. 최종 검토는 내일이래.",
      time: new Date("2026-05-15T10:02:00"),
      avatar: { fallback: "민서" },
      participants: [min],
      statusNote: "12분 전 접속",
      messages: buildMessages("min-thread", min, me),
      mediaPreview: [
        {
          id: "min-media-1",
          src: createMockImage("#be123c", "#fb7185", "#fde68a"),
          alt: "면접 준비 보드 미리보기",
        },
      ],
      filePreview: [{ name: "이력서-v7.pdf", size: 1024 * 256 }],
    },
    {
      id: "room-crew",
      type: "group",
      name: "영상팀",
      preview: "인트로에는 클로즈업 한 컷만 있으면 될 것 같아.",
      time: new Date("2026-05-15T11:18:00"),
      unreadCount: 1,
      avatar: { fallback: "영상팀" },
      participants: [crew, { id: "hyun", name: "현서" }, { id: "lena", name: "레나" }, me],
      statusNote: "4명",
      messages: buildMessages("crew-thread", crew, me),
      mediaPreview: [
        {
          id: "crew-media-1",
          src: createMockImage("#166534", "#4ade80", "#f8fafc"),
          alt: "스토리보드 프레임 미리보기",
        },
        {
          id: "crew-media-2",
          src: createMockImage("#1d4ed8", "#93c5fd", "#e0f2fe"),
          alt: "조명 레퍼런스 미리보기",
        },
        {
          id: "crew-media-3",
          src: createMockImage("#9a3412", "#fdba74", "#fff7ed"),
          alt: "로케이션 답사 미리보기",
        },
      ],
      filePreview: [
        { name: "샷리스트-v2.csv", size: 1024 * 48 },
        { name: "스토리보드-정리.key", size: 1024 * 1024 * 3 },
      ],
    },
  ]

  return [...rooms, ...createScrollTestRooms(me)]
}

const getRoomSubtitle = (room: MessageRoom) => {
  if (room.type === "group") {
    return room.statusNote ?? `${room.participants.length}명`
  }

  if (room.isOnline) {
    return room.statusNote ?? "지금 활동 중"
  }

  return room.statusNote ?? room.participants.map((participant) => participant.name).join(", ")
}

const getMainGridClass = (isDetailOpen: boolean, isInboxCollapsed: boolean) => {
  if (isInboxCollapsed) {
    return isDetailOpen
      ? "md:grid-cols-[4rem_minmax(0,1fr)] lg:grid-cols-[4rem_minmax(0,1fr)_19rem]"
      : "md:grid-cols-[4rem_minmax(0,1fr)] lg:grid-cols-[4rem_minmax(0,1fr)]"
  }

  return isDetailOpen
    ? "md:grid-cols-[19.375rem_minmax(0,1fr)] lg:grid-cols-[22.5rem_minmax(0,1fr)_19rem]"
    : "md:grid-cols-[19.375rem_minmax(0,1fr)] lg:grid-cols-[22.5rem_minmax(0,1fr)]"
}

interface InboxPaneProps {
  collapsed?: boolean
  rooms: MessageRoom[]
  searchValue: string
  showCollapseButton?: boolean
  onToggleCollapsed?: () => void
  selectedRoomId: string | null
  onSearchChange: (value: string) => void
  onClearSearch: () => void
  onSelectRoom: (roomId: string) => void
}

const InboxPane = ({
  collapsed = false,
  rooms,
  searchValue,
  showCollapseButton = false,
  onToggleCollapsed,
  selectedRoomId,
  onSearchChange,
  onClearSearch,
  onSelectRoom,
}: InboxPaneProps) => (
  <section className="flex h-full min-h-0 flex-col overflow-hidden border-r-0 border-[var(--color-border-default)] bg-[var(--color-surface-raised)] md:border-r">
    <div
      className={`py-4 md:py-3 ${collapsed ? "flex justify-center px-2" : "space-y-3 px-4 md:space-y-2 md:px-5"}`}
    >
      <div className="flex items-center justify-between gap-3">
        {!collapsed && (
          <h2 className="text-xl font-semibold text-[var(--color-text-primary)] md:text-sm">
            채팅
          </h2>
        )}
        {showCollapseButton && onToggleCollapsed && (
          <IconButton
            icon={Menu}
            aria-label={collapsed ? "채팅 목록 펼치기" : "채팅 목록 접기"}
            size="sm"
            onClick={onToggleCollapsed}
          />
        )}
      </div>
      {!collapsed && (
        <SearchBar
          value={searchValue}
          onChange={onSearchChange}
          onClear={onClearSearch}
          placeholder="메시지 검색"
        />
      )}
    </div>

    {!collapsed && (
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 md:p-2">
        {rooms.length === 0 ? (
          <EmptyState
            variant="search"
            title="검색 결과가 없어요"
            description="다른 이름으로 검색하거나 검색어를 지워보세요."
            className="h-full"
          />
        ) : (
          <div className="space-y-1" aria-label="Conversation list">
            {rooms.map((room) => {
              const isSelected = room.id === selectedRoomId

              return (
                <ChatRoomItem
                  key={room.id}
                  avatar={room.avatar}
                  name={room.name}
                  preview={room.preview}
                  time={room.time}
                  unreadCount={room.unreadCount}
                  isOnline={room.type === "direct" ? room.isOnline : false}
                  onClick={() => onSelectRoom(room.id)}
                  className={`border border-transparent ${
                    isSelected ? "bg-[var(--color-surface-subtle)]" : "bg-transparent"
                  }`}
                />
              )
            })}
          </div>
        )}
      </div>
    )}
  </section>
)

interface RoomPaneProps {
  room: MessageRoom
  composerValue: string
  onComposerChange: (value: string) => void
  onSend: () => void
  onOpenDetail: () => void
  onBack?: () => void
  showBackButton?: boolean
}

const RoomPane = ({
  room,
  composerValue,
  onComposerChange,
  onSend,
  onOpenDetail,
  onBack,
  showBackButton = false,
}: RoomPaneProps) => {
  const isSendDisabled = composerValue.trim().length === 0

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--color-surface-subtle)] p-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[0.5rem] bg-[var(--color-surface-base)] shadow-lg">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-surface-base)] px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            {showBackButton && onBack && (
              <IconButton
                icon={ArrowLeft}
                aria-label="목록으로 돌아가기"
                size="sm"
                onClick={onBack}
              />
            )}
            <Avatar {...room.avatar} fallback={room.name} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                {room.name}
              </p>
              <p className="truncate text-xs text-[var(--color-text-secondary)]">
                {getRoomSubtitle(room)}
              </p>
            </div>
          </div>
          <IconButton icon={Info} aria-label="대화 정보 열기" size="sm" onClick={onOpenDetail} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--color-surface-base)] px-3 py-4 sm:px-4 sm:py-5">
          <MessageThread
            messages={room.messages}
            currentUserId={CURRENT_USER_ID}
            className="mx-auto w-full"
          />
        </div>
        <div className="shrink-0 bg-[var(--color-surface-raised)] px-3 py-1 [padding-bottom:calc(0.25rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto flex items-center gap-2 rounded-[1.5rem] bg-[var(--color-surface-base)] p-1 sm:gap-3">
            <MediaAttachBar className="shrink-0" />
            <Textarea
              value={composerValue}
              onChange={(event) => onComposerChange(event.target.value)}
              autoResize={true}
              minRows={1}
              maxRows={5}
              aria-label="메시지 입력"
              placeholder="메시지 보내기"
              className="min-h-0 min-w-0 flex-1 border-none bg-[var(--color-surface-subtle)] px-3 py-1 shadow-none focus-visible:ring-0"
            />
            <Button
              type="button"
              size="sm"
              onClick={onSend}
              disabled={isSendDisabled}
              className="shrink-0"
            >
              전송
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

interface DetailPaneProps {
  room: MessageRoom
  compact?: boolean
  onBack?: () => void
  onClose?: () => void
}

const DetailPane = ({ room, compact = false, onBack, onClose }: DetailPaneProps) => {
  const title = room.type === "group" ? "그룹 정보" : "대화 정보"

  return (
    <aside className="flex h-full min-h-0 flex-col border-l-0 border-[var(--color-border-default)] bg-[var(--color-surface-raised)] md:border-l">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-default)] px-4 py-3">
        <div className="flex items-center gap-2">
          {compact && onBack && (
            <IconButton icon={ArrowLeft} aria-label="대화로 돌아가기" size="sm" onClick={onBack} />
          )}
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
        </div>
        {!compact && onClose && (
          <IconButton
            icon={PanelRightClose}
            aria-label="대화 정보 닫기"
            size="sm"
            onClick={onClose}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <section className="space-y-4 rounded-[1.5rem] bg-[var(--color-surface-base)] p-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <Avatar {...room.avatar} fallback={room.name} size="xl" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {room.name}
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">{getRoomSubtitle(room)}</p>
            </div>
          </div>

          {room.type === "group" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
                <Users className="h-4 w-4 text-[var(--color-text-secondary)]" />
                <span>멤버</span>
              </div>
              <div className="space-y-2">
                {room.participants.map((participant) => (
                  <div key={participant.id} className="flex items-center gap-3">
                    <Avatar {...participant.avatar} fallback={participant.name} size="sm" />
                    <span className="text-sm text-[var(--color-text-primary)]">
                      {participant.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <></>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">공유 미디어</h3>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {room.mediaPreview?.length ?? 0}개
            </span>
          </div>
          {room.mediaPreview && room.mediaPreview.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {room.mediaPreview.map((item) => (
                <ImageThumb
                  key={item.id}
                  src={item.src}
                  alt={item.alt}
                  aspect="square"
                  rounded="lg"
                />
              ))}
            </div>
          ) : (
            <EmptyState
              variant="messages"
              title="공유된 미디어가 없어요"
              description="이 대화방에서 주고받은 이미지와 영상이 여기에 표시됩니다."
              className="rounded-[1.5rem] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-6"
            />
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">파일</h3>
            <span className="text-xs text-[var(--color-text-tertiary)]">
              {room.filePreview?.length ?? 0}개
            </span>
          </div>
          {room.filePreview && room.filePreview.length > 0 ? (
            <div className="space-y-2">
              {room.filePreview.map((file) => (
                <FileChip
                  key={`${file.name}-${file.size ?? "na"}`}
                  fileName={file.name}
                  fileSize={file.size}
                  className="w-full"
                />
              ))}
            </div>
          ) : (
            <EmptyState
              variant="default"
              title="공유된 파일이 없어요"
              description="이 대화방에서 공유한 파일이 여기에 표시됩니다."
              className="rounded-[1.5rem] border border-[var(--color-border-default)] bg-[var(--color-surface-base)] p-6"
            />
          )}
        </section>
      </div>
    </aside>
  )
}

const MessagePage = React.forwardRef<HTMLDivElement, MessagePageProps>(
  ({ className, ...props }, ref) => {
    const [rooms, setRooms] = React.useState<MessageRoom[]>(() => createMockRooms())
    const [selectedRoomId, setSelectedRoomId] = React.useState<string | null>("room-nari")
    const [searchValue, setSearchValue] = React.useState("")
    const [composerValue, setComposerValue] = React.useState("")
    const [isInboxCollapsed, setIsInboxCollapsed] = React.useState(false)
    const [isDetailOpen, setIsDetailOpen] = React.useState(false)
    const [mobileScreen, setMobileScreen] = React.useState<MobileScreen>("list")

    React.useEffect(() => {
      const historyScreen = getMessagePageHistoryScreen()

      if (historyScreen) {
        setMobileScreen(historyScreen)
      } else {
        setMessagePageHistoryScreen("list", "replace")
      }

      const handlePopState = () => {
        setMobileScreen(getMessagePageHistoryScreen() ?? "list")
      }

      window.addEventListener("popstate", handlePopState)
      return () => {
        window.removeEventListener("popstate", handlePopState)
      }
    }, [])

    const normalizedSearchValue = searchValue.trim().toLowerCase()
    const filteredRooms = normalizedSearchValue
      ? rooms.filter((room) => room.name.toLowerCase().includes(normalizedSearchValue))
      : rooms
    const currentRoom = rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null

    const selectRoom = (roomId: string) => {
      setSelectedRoomId(roomId)
      setRooms((previousRooms) =>
        previousRooms.map((room) => (room.id === roomId ? { ...room, unreadCount: 0 } : room))
      )
    }

    const pushMobileScreen = (screen: MobileScreen) => {
      if (getMessagePageHistoryScreen() !== screen) {
        setMessagePageHistoryScreen(screen, "push")
      }

      setMobileScreen(screen)
    }

    const backToMobileScreen = (fallbackScreen: MobileScreen) => {
      const historyScreen = getMessagePageHistoryScreen()

      if (historyScreen && historyScreen !== fallbackScreen) {
        window.history.back()
        return
      }

      setMessagePageHistoryScreen(fallbackScreen, "replace")
      setMobileScreen(fallbackScreen)
    }

    const selectMobileRoom = (roomId: string) => {
      selectRoom(roomId)
      pushMobileScreen("room")
    }

    const sendMessage = () => {
      if (!currentRoom) {
        return
      }

      const nextContent = composerValue.trim()
      if (!nextContent) {
        return
      }

      const nextMessage: MessageThreadMessage = {
        id: `sent-${Date.now()}`,
        sender: {
          id: CURRENT_USER_ID,
          name: "나",
        },
        content: nextContent,
        time: new Date(),
      }

      setRooms((previousRooms) =>
        previousRooms.map((room) =>
          room.id === currentRoom.id
            ? {
                ...room,
                preview: nextContent,
                time: nextMessage.time ?? room.time,
                messages: [...room.messages, nextMessage],
              }
            : room
        )
      )
      setComposerValue("")
    }

    return (
      <div
        ref={ref}
        className={`flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-surface-base)] text-[var(--color-text-primary)] ${className ?? ""}`}
        {...props}
      >
        <div className="hidden md:block">
          <PageHeader />
        </div>

        <main className="min-h-0 flex-1 md:hidden">
          {mobileScreen === "list" && (
            <InboxPane
              rooms={filteredRooms}
              searchValue={searchValue}
              selectedRoomId={selectedRoomId}
              onSearchChange={setSearchValue}
              onClearSearch={() => setSearchValue("")}
              onSelectRoom={selectMobileRoom}
            />
          )}

          {currentRoom && mobileScreen === "room" && (
            <div className="h-full motion-safe:animate-[message-page-panel-in_160ms_ease-out]">
              <RoomPane
                room={currentRoom}
                composerValue={composerValue}
                onComposerChange={setComposerValue}
                onSend={sendMessage}
                onOpenDetail={() => pushMobileScreen("detail")}
                onBack={() => backToMobileScreen("list")}
                showBackButton={true}
              />
            </div>
          )}

          {currentRoom && mobileScreen === "detail" && (
            <div className="h-full motion-safe:animate-[message-page-panel-in_160ms_ease-out]">
              <DetailPane
                room={currentRoom}
                compact={true}
                onBack={() => backToMobileScreen("room")}
              />
            </div>
          )}
        </main>

        <main
          className={`hidden h-full min-h-0 flex-1 grid-cols-1 overflow-hidden transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:grid lg:gap-0 ${getMainGridClass(
            isDetailOpen,
            isInboxCollapsed
          )}`}
        >
          <InboxPane
            collapsed={isInboxCollapsed}
            rooms={filteredRooms}
            searchValue={searchValue}
            showCollapseButton={true}
            selectedRoomId={selectedRoomId}
            onToggleCollapsed={() => setIsInboxCollapsed((previousValue) => !previousValue)}
            onSearchChange={setSearchValue}
            onClearSearch={() => setSearchValue("")}
            onSelectRoom={selectRoom}
          />

          {currentRoom ? (
            <>
              <div className={`h-full min-h-0 ${isDetailOpen ? "hidden lg:block" : "block"}`}>
                <RoomPane
                  room={currentRoom}
                  composerValue={composerValue}
                  onComposerChange={setComposerValue}
                  onSend={sendMessage}
                  onOpenDetail={() => setIsDetailOpen((value) => !value)}
                />
              </div>

              {isDetailOpen && (
                <div className="h-full min-h-0 motion-safe:animate-[message-page-panel-in_160ms_ease-out]">
                  <DetailPane room={currentRoom} onClose={() => setIsDetailOpen(false)} />
                </div>
              )}
            </>
          ) : (
            <div className="flex min-h-[24rem] items-center justify-center">
              <EmptyState
                variant="messages"
                title="대화를 선택하세요"
                description="왼쪽 목록에서 대화방을 선택하면 메시지를 볼 수 있어요."
              />
            </div>
          )}
        </main>
      </div>
    )
  }
)

MessagePage.displayName = "MessagePage"

export { MessagePage }
