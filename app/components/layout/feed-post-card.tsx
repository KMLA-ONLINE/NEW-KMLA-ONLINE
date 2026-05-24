import { PostActionBar } from "~/components/post-action-bar"
import { Badge } from "~/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

export type FeedPostCardProps = {
  source: string
  title: string
  description: string
  author: string
  time: string
  comments: number
  likes: number
  isFeatured?: boolean
}

export function FeedPostCard({
  source,
  title,
  description,
  author,
  time,
  comments,
  likes,
  isFeatured = false,
}: FeedPostCardProps) {
  return (
    <Card
      size="sm"
      className="hover:bg-muted/60 dark:hover:bg-muted/40 border-0 bg-transparent shadow-none ring-0 transition-colors"
    >
      <CardHeader className="gap-1.5 px-4 sm:gap-2 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isFeatured ? <Badge>Featured</Badge> : null}
            <Badge variant="secondary">{source}</Badge>
          </div>
          <p className="text-muted-foreground text-xs">{time}</p>
        </div>
        <CardTitle className="text-sm sm:text-base">{title}</CardTitle>
        <CardDescription className="line-clamp-2 text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground flex flex-col items-start gap-2 px-4 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Posted by {author}</p>
        <PostActionBar
          comments={comments}
          likes={likes}
          className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-1"
        />
      </CardContent>
    </Card>
  )
}
