import { useNoti } from "~/components/noti/noti-context"
import { seedRooms } from "~/lib/messenger/mock-data"

/**
 * 내비에 띄울 안 읽은 수를 경로별로 준다. 사이드바와 탭바가 같이 쓴다.
 *
 * 두 값 모두 백엔드에서도 같은 관계가 성립한다:
 * - 메시지: 대화별 unreadCount의 합 = get_unread_message_count() (대화당 100에서 자른다).
 * - 알림: read_at is null인 알림 수 = get_unread_notification_count() (100에서 자른다).
 * 그래서 나중에 값의 의미가 바뀌지 않는다.
 *
 * TODO(backend): _app 로더가 두 RPC를 호출해 내려주면 이 훅은 useRouteLoaderData("routes/_app")
 * 한 줄이 되고, mock import와 NotiProvider는 사라진다. 내비·뱃지 쪽은 손댈 게 없다.
 */
export function useNavBadges(): Record<string, number> {
  const unreadMessages = seedRooms.reduce((total, room) => total + (room.unreadCount ?? 0), 0)
  const { unreadCount: unreadNotifications } = useNoti()

  return { "/messenger": unreadMessages, "/noti": unreadNotifications }
}
