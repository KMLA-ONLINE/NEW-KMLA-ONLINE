import * as React from "react"
import { Globe2, Lock, MoreHorizontal, Users, UserCheck, type LucideIcon } from "lucide-react"
import { Button, type ButtonProps } from "../../atoms/Button"

import { IconButton } from "../../atoms/IconButton"
import { ImageThumb } from "../../atoms/ImageThumb"
import { Tag } from "../../atoms/Tag"
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "../../molecules/DropdownMenu"

export interface GroupHeaderImage {
  src?: string
  alt?: string
}

export interface GroupHeaderAction {
  label: string
  icon?: LucideIcon
  variant?: ButtonProps["variant"]
  disabled?: boolean
  onClick?: () => void
}

export interface GroupHeaderMenuItem {
  label: string
  variant?: "default" | "danger"
  disabled?: boolean
  separatorBefore?: boolean
  onSelect?: () => void
}

export interface GroupHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  name: string
  coverImage?: GroupHeaderImage
  category?: string
  isPrivate?: boolean
  isJoined?: boolean
  memberCount?: number
  actions?: GroupHeaderAction[]
  moreMenuItems?: GroupHeaderMenuItem[]
}

const formatCount = (count: number) => count.toLocaleString()

const GroupHeader = React.forwardRef<HTMLElement, GroupHeaderProps>(
  (
    {
      name,
      coverImage,
      category,
      isPrivate,
      isJoined,
      memberCount,
      actions = [],
      moreMenuItems,
      className,
      ...props
    },
    ref
  ) => {
    const PrivacyIcon = isPrivate ? Lock : Globe2
    const privacyLabel = isPrivate ? "비공개 그룹" : "공개 그룹"

    const defaultActions: GroupHeaderAction[] = [
      { label: "가입됨", icon: UserCheck, variant: "secondary" },
    ]

    const defaultMoreMenuItems: GroupHeaderMenuItem[] = [
      { label: "알림 관리" },
      { label: "그룹 팔로우 취소" },
      { label: "그룹 나가기", variant: "danger", separatorBefore: true },
    ]

    const computedActions = actions.length > 0 ? actions : isJoined ? defaultActions : []
    const computedMoreMenuItems = moreMenuItems ?? (isJoined ? defaultMoreMenuItems : [])

    return (
      <section
        ref={ref}
        className={`w-full overflow-hidden rounded-xl bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] ${className ?? ""}`}
        {...props}
      >
        <ImageThumb
          src={coverImage?.src}
          alt={coverImage?.alt ?? `${name} 커버 이미지`}
          aspect="wide"
          size="full"
          rounded="none"
          className="h-36 w-full sm:h-52 md:h-64"
        />

        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold text-[var(--color-text-primary)] sm:text-3xl">
                  {name}
                </h1>
                {category && (
                  <Tag variant="primary" size="sm">
                    {category}
                  </Tag>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-text-secondary)]">
                <span className="inline-flex items-center gap-1">
                  <PrivacyIcon className="h-4 w-4" aria-hidden="true" />
                  {privacyLabel}
                </span>
                {memberCount !== undefined && (
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-4 w-4" aria-hidden="true" />
                    멤버 {formatCount(memberCount)}명
                  </span>
                )}
              </div>
            </div>

            {(computedActions.length > 0 || computedMoreMenuItems.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {computedActions.map((action) => {
                  const Icon = action.icon

                  return (
                    <Button
                      key={action.label}
                      type="button"
                      variant={action.variant ?? "secondary"}
                      size="sm"
                      disabled={action.disabled}
                      onClick={action.onClick}
                    >
                      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
                      {action.label}
                    </Button>
                  )
                })}

                {computedMoreMenuItems.length > 0 && (
                  <DropdownMenu
                    trigger={
                      <IconButton
                        icon={MoreHorizontal}
                        aria-label="그룹 옵션"
                        variant="secondary"
                        size="sm"
                      />
                    }
                  >
                    {computedMoreMenuItems.map((item) => (
                      <React.Fragment key={item.label}>
                        {item.separatorBefore && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          variant={item.variant}
                          disabled={item.disabled}
                          onSelect={item.onSelect}
                        >
                          {item.label}
                        </DropdownMenuItem>
                      </React.Fragment>
                    ))}
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    )
  }
)
GroupHeader.displayName = "GroupHeader"

export { GroupHeader }
