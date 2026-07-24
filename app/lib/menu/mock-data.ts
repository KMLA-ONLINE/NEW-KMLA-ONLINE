import type { GroupPostSpace } from "~/lib/group/types"
import type { Database } from "~/lib/supabase/database.types"

/**
 * space_members.notification_setting (public.notification_setting enum).
 * 알림은 **space마다** 따로 정한다 -- 전역 스위치는 스키마에 없다. 그래서 이 화면이 하는 일은
 * "내가 속한 space들의 설정을 한자리에서 바꾸는 것"이지 새 전역 값을 만드는 게 아니다.
 */
export type NotificationSetting = Database["public"]["Enums"]["notification_setting"]

export type SpaceNotification = {
  space: GroupPostSpace
  setting: NotificationSetting
}

// 내가 속한 space와 각각의 알림 설정. 로더가 space_members를 읽을 때까지의 대역.
// 기본값이 'mentions'인 것도 스키마 그대로다(멤버가 되면 멘션만 받는다).
export const mockSpaceNotifications: SpaceNotification[] = [
  {
    space: { name: "행정위원회", type: "group", pubId: "student-council" },
    setting: "all",
  },
  { space: { name: "사감부", type: "group", pubId: "dorm-office" }, setting: "all" },
  { space: { name: "도서부", type: "group", pubId: "library-committee" }, setting: "mentions" },
  { space: { name: "코딩 동아리", type: "community", pubId: "coding-club" }, setting: "mentions" },
  { space: { name: "중고장터", type: "community", pubId: "secondhand" }, setting: "off" },
  {
    space: { name: "분실물 센터", type: "community", pubId: "lost-and-found" },
    setting: "mentions",
  },
]
