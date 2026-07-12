import { seedRooms } from "~/lib/messenger/mock-data"

/**
 * 내비에 띄울 안 읽은 수를 경로별로 준다. 사이드바와 탭바가 같이 쓴다.
 *
 * mock은 대화별 unreadCount의 합인데, 이건 백엔드에서도 그대로 성립하는 관계다 --
 * get_unread_message_count()가 정확히 list_conversations()의 unread_count 합과 같은 값을
 * (대화당 100에서 잘라서) 돌려준다. 그래서 나중에 값의 의미가 바뀌지 않는다.
 *
 * TODO(backend): _app 로더에서 get_unread_message_count() RPC로 메시지 수를, 알림은
 * notifications(recipient_id=me, read_at is null) 카운트로 받아 내려준다. 그러면 이 훅은
 * useRouteLoaderData("routes/_app") 한 줄이 되고 mock import는 사라진다. 알림 뱃지는 그때
 * "/noti" 키를 추가하면 되고, 내비·뱃지 쪽은 손댈 게 없다.
 */
export function useNavBadges(): Record<string, number> {
  const unreadMessages = seedRooms.reduce((total, room) => total + (room.unreadCount ?? 0), 0)

  return { "/messenger": unreadMessages }
}
