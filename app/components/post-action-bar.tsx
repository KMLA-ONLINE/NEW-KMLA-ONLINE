import { HeartIcon, MessageSquareIcon, Share2Icon } from "lucide-react"

import { FeedPostActionButton } from "~/components/feed-post-action-button"

type PostActionBarProps = {
  likes: number
  comments: number
  className?: string
}

export function PostActionBar({ comments, likes, className }: PostActionBarProps) {
  return (
    <div className={className}>
      <FeedPostActionButton icon={HeartIcon} label="Likes" count={likes} />
      <FeedPostActionButton icon={MessageSquareIcon} label="Comments" count={comments} />
      <FeedPostActionButton icon={Share2Icon} label="Share" />
    </div>
  )
}
