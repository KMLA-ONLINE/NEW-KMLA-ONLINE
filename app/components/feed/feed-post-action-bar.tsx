import { HeartIcon, MessageSquareIcon, Share2Icon } from "lucide-react"

import { FeedPostActionButton } from "~/components/feed/feed-post-action-button"

type FeedPostActionBarProps = {
  likes: number
  comments: number
  className?: string
}

// 홈 피드 전용이다. 그룹은 반응/댓글 수를 실제로 세는 group-post-action-bar를 따로 쓴다.
export function FeedPostActionBar({ comments, likes, className }: FeedPostActionBarProps) {
  return (
    <div className={className}>
      <FeedPostActionButton icon={HeartIcon} label="Likes" count={likes} />
      <FeedPostActionButton icon={MessageSquareIcon} label="Comments" count={comments} />
      <FeedPostActionButton icon={Share2Icon} label="Share" />
    </div>
  )
}
