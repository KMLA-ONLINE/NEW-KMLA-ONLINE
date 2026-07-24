import { UsersIcon } from "lucide-react"

import { ProfileAvatar, ProfileAvatarLink } from "~/components/profile/profile-avatar"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { CURRENT_USER } from "~/lib/messenger/constants"
import type { Room } from "~/lib/messenger/types"
import { cn } from "~/lib/utils"

type ConversationAvatarRoom = Pick<Room, "type" | "name" | "avatarUrl" | "participants">

export function ConversationAvatar({
  room,
  className,
  linkProfile = false,
}: {
  room: ConversationAvatarRoom
  className?: string
  linkProfile?: boolean
}) {
  const otherParticipants = room.participants.filter(
    (participant) => participant.id !== CURRENT_USER.id
  )

  if (room.type === "direct") {
    const peer = otherParticipants[0]
    if (peer && linkProfile) {
      return <ProfileAvatarLink profile={peer} avatarClassName={cn("size-10", className)} />
    }

    return (
      <ProfileAvatar
        profile={peer ?? { name: room.name, avatarUrl: room.avatarUrl }}
        className={cn("size-10", className)}
      />
    )
  }

  const members = otherParticipants.slice(0, 2)
  if (members.length > 0) {
    return (
      <span className={cn("relative size-10 shrink-0", className)} aria-hidden="true">
        {members.map((member, index) => (
          <ProfileAvatar
            key={member.id}
            profile={member}
            className={cn(
              "ring-card absolute size-[70%] ring-2",
              members.length === 1
                ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                : index === 0
                  ? "top-0 left-0"
                  : "right-0 bottom-0"
            )}
          />
        ))}
      </span>
    )
  }

  return (
    <Avatar className={cn("size-10", className)}>
      <AvatarFallback>
        <UsersIcon className="size-1/2" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  )
}
