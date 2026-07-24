import type { ReactNode } from "react"
import { VenetianMaskIcon } from "lucide-react"
import { Link } from "react-router"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import type { Tables } from "~/lib/supabase/database.types"
import { cn } from "~/lib/utils"

type AvatarSize = "default" | "sm" | "lg"

export type ProfileAvatarData = {
  id: Tables<"profiles">["id"]
  name: Tables<"profiles">["name"]
  /** Signed display URL derived from profiles.avatar_url. */
  avatarUrl: Tables<"profiles">["avatar_url"]
}

export function ProfileAvatar({
  profile,
  size,
  className,
  imageAlt = "",
}: {
  profile: Pick<ProfileAvatarData, "name" | "avatarUrl">
  size?: AvatarSize
  className?: string
  imageAlt?: string
}) {
  return (
    <Avatar size={size} className={className}>
      {profile.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt={imageAlt} /> : null}
      <AvatarFallback className="overflow-hidden">
        <img src="/avatar.svg" alt="" className="size-full rounded-full opacity-55 dark:invert" />
      </AvatarFallback>
    </Avatar>
  )
}

export function ProfileAvatarLink({
  profile,
  size,
  className,
  avatarClassName,
  children,
}: {
  profile: ProfileAvatarData
  size?: AvatarSize
  className?: string
  avatarClassName?: string
  children?: ReactNode
}) {
  return (
    <Link
      to={`/profile/${profile.id}`}
      prefetch="intent"
      aria-label={`${profile.name} 프로필 보기`}
      className={cn(
        "focus-visible:ring-ring relative inline-flex shrink-0 rounded-full focus-visible:ring-2 focus-visible:outline-none",
        className
      )}
    >
      <ProfileAvatar
        profile={profile}
        size={size}
        className={cn("transition-opacity hover:opacity-80", avatarClassName)}
      />
      {children}
    </Link>
  )
}

const ANONYMOUS_ICON_SIZE = {
  default: "size-4",
  lg: "size-5",
  sm: "size-3",
} as const

export function AnonymousAvatar({
  size = "default",
  className,
}: {
  size?: AvatarSize
  className?: string
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className="bg-primary/80 text-primary-foreground">
        <VenetianMaskIcon className={ANONYMOUS_ICON_SIZE[size]} aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  )
}
