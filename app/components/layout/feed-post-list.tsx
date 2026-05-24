import { FeedPostCard, type FeedPostCardProps } from "~/components/layout/feed-post-card"
import { Separator } from "~/components/ui/separator"

type FeedPostListProps = {
  items: FeedPostCardProps[]
  className?: string
  showSeparators?: boolean
}

export function FeedPostList({ items, className, showSeparators = true }: FeedPostListProps) {
  return (
    <section className={className}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1

        return (
          <div key={`${item.source}-${item.title}-${index}`}>
            <FeedPostCard {...item} />
            {showSeparators && !isLast ? <Separator className="my-1" /> : null}
          </div>
        )
      })}
    </section>
  )
}
