import * as React from "react"
import { MessageCircle, MoreHorizontal, Share2, ThumbsUp } from "lucide-react"
import { Avatar } from "../../atoms/Badge/Avatar"
import { Button } from "../../atoms/Button"
import { Divider } from "../../atoms/Divider"
import { IconButton } from "../../atoms/IconButton"
import { Link } from "../../atoms/Link"
import { TimeBadge } from "../../atoms/TimeBadge"
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "../../molecules/DropdownMenu"
import { ImageGrid, type ImageGridItem } from "../../molecules/ImageGrid"

export interface PostCardAuthor {
  name: string
  href?: string
  avatarSrc?: string
  avatarFallback?: string
}

export interface PostCardStats {
  likes?: number
  comments?: number
  shares?: number
}

export interface PostCardMenuItem {
  label: string
  variant?: "default" | "danger"
  disabled?: boolean
  separatorBefore?: boolean
  onSelect?: () => void
}

export interface PostCardProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  author: PostCardAuthor
  content: string
  timestamp: Date | string | number
  groupName?: string
  groupHref?: string
  images?: ImageGridItem[]
  moreMenuItems?: PostCardMenuItem[]
  stats?: PostCardStats
  isLiked?: boolean
  onLike?: () => void
  onComment?: () => void
  onShare?: () => void
  onMore?: () => void
}

const formatCount = (count: number) => count.toLocaleString()

const PostCard = React.forwardRef<HTMLElement, PostCardProps>(
  (
    {
      author,
      content,
      timestamp,
      groupName,
      groupHref,
      images = [],
      moreMenuItems = [],
      stats,
      isLiked,
      onLike,
      onComment,
      onShare,
      onMore,
      className,
      ...props
    },
    ref
  ) => {
    const comments = stats?.comments ?? 0
    const shares = stats?.shares ?? 0

    return (
      <article
        ref={ref}
        className={`w-full overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] shadow-sm ${className ?? ""}`}
        {...props}
      >
        <header className="flex items-start gap-3 p-4">
          {author.href ? (
            <Link
              href={author.href}
              aria-label={`${author.name} 프로필 보기`}
              underline="none"
              className="rounded-full"
            >
              <Avatar
                src={author.avatarSrc}
                alt={author.name}
                fallback={author.avatarFallback ?? author.name}
                size="md"
              />
            </Link>
          ) : (
            <Avatar
              src={author.avatarSrc}
              alt={author.name}
              fallback={author.avatarFallback ?? author.name}
              size="md"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1 text-sm font-semibold">
              {author.href ? (
                <Link
                  href={author.href}
                  underline="hover"
                  className="max-w-full truncate text-[var(--color-text-primary)] hover:text-[var(--color-text-primary)]"
                >
                  {author.name}
                </Link>
              ) : (
                <span className="truncate">{author.name}</span>
              )}
              {groupName && (
                <>
                  <span className="text-[var(--color-text-tertiary)]">·</span>
                  {groupHref ? (
                    <Link
                      href={groupHref}
                      variant="secondary"
                      underline="hover"
                      className="max-w-full truncate"
                    >
                      {groupName}
                    </Link>
                  ) : (
                    <span className="truncate text-[var(--color-text-secondary)]">{groupName}</span>
                  )}
                </>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[var(--color-text-tertiary)]">
              <TimeBadge date={timestamp} format="relative" size="sm" />
            </div>
          </div>
          <DropdownMenu
            trigger={
              <IconButton
                icon={MoreHorizontal}
                aria-label="게시물 옵션"
                variant="ghost"
                size="sm"
                onClick={onMore}
              />
            }
          >
            {moreMenuItems.map((item) => (
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
            {moreMenuItems.length === 0 && (
              <DropdownMenuItem disabled>사용 가능한 메뉴가 없습니다</DropdownMenuItem>
            )}
          </DropdownMenu>
        </header>

        <p className="px-4 pb-4 text-sm leading-6 whitespace-pre-line text-[var(--color-text-primary)]">
          {content}
        </p>

        {images.length > 0 && (
          <ImageGrid
            images={images}
            className="rounded-none border-y border-[var(--color-border-default)]"
          />
        )}

        <div className="flex items-center justify-between px-4 py-3 text-xs text-[var(--color-text-secondary)]">
          <div>
            {stats?.likes !== undefined && <span>{formatCount(stats.likes)}명이 좋아합니다</span>}
          </div>
          <div className="flex items-center gap-3">
            {comments > 0 && <span>댓글 {formatCount(comments)}개</span>}
            {shares > 0 && <span>공유 {formatCount(shares)}회</span>}
          </div>
        </div>

        <Divider />

        <div className="grid grid-cols-3 gap-1 p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`w-full ${isLiked ? "text-[var(--color-primary-600)]" : ""}`}
            onClick={onLike}
          >
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            좋아요
          </Button>
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onComment}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            댓글
          </Button>
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onShare}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            공유
          </Button>
        </div>
      </article>
    )
  }
)
PostCard.displayName = "PostCard"

export { PostCard }
