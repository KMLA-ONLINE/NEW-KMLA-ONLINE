import { ShieldCheckIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"

export function GroupStaffAvatar({
  size = "default",
  className,
}: {
  size?: "default" | "lg" | "sm"
  className?: string
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className="bg-primary text-primary-foreground">
        <ShieldCheckIcon aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  )
}
