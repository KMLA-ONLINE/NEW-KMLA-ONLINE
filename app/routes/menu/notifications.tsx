import { useState } from "react"

import { MenuSubHeader } from "~/components/menu/menu-sub-header"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { mockSpaceNotifications, type NotificationSetting } from "~/lib/menu/mock-data"

const OPTIONS: { value: NotificationSetting; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "mentions", label: "멘션만" },
  { value: "off", label: "끄기" },
]

export default function NotificationSettingsPage() {
  // TODO(backend): space_members.notification_setting을 직접 update하면 된다 -- 정책이 내 행만
  // 열고 컬럼 grant에 이 컬럼이 있어서 RPC가 필요 없다.
  const [settings, setSettings] = useState(mockSpaceNotifications)

  const change = (pubId: string, setting: NotificationSetting) =>
    setSettings((current) =>
      current.map((item) => (item.space.pubId === pubId ? { ...item, setting } : item))
    )

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <MenuSubHeader title="알림 설정" />
      <p className="text-muted-foreground text-sm">
        알림은 그룹마다 따로 정합니다. 새로 가입하면 공식 그룹은 전체, 비공식 그룹은 멘션만
        받습니다.
      </p>
      <ul className="bg-card divide-border/70 divide-y overflow-hidden rounded-xl border">
        {settings.map(({ space, setting }) => (
          <li key={space.pubId} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{space.name}</p>
              <p className="text-muted-foreground text-xs">
                {space.type === "group" ? "공식 그룹" : "비공식 그룹"}
              </p>
            </div>
            <Select
              value={setting}
              onValueChange={(value) => change(space.pubId, value as NotificationSetting)}
            >
              <SelectTrigger className="w-30 shrink-0" aria-label={`${space.name} 알림`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>
    </div>
  )
}
