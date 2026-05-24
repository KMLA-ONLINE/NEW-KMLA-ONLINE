import { Separator } from "~/components/ui/separator"
import { FeedPostList } from "~/components/layout/feed-post-list"
import { Button } from "~/components/ui/button"

const feedItems = [
  {
    source: "Group: Academic Office",
    title: "Academic schedule updates for next week",
    description:
      "Midterm preparation sessions and advisory room allocations were finalized. Check your group space for detailed time slots.",
    author: "Academic Office",
    time: "2h ago",
    comments: 3,
    likes: 14,
    isFeatured: true,
  },
  {
    source: "Group: Student Council",
    title: "Spring Festival volunteer sign-up closes tomorrow",
    description:
      "Please register by 6 PM. Team assignments will be shared in each committee space.",
    author: "Student Council",
    time: "15m ago",
    comments: 8,
    likes: 21,
  },
  {
    source: "Community: Lost Gadgets",
    title: "Found wireless earbuds near the library entrance",
    description: "If these are yours, send a message with the case color to verify ownership.",
    author: "2-3 J. Kim",
    time: "43m ago",
    comments: 11,
    likes: 9,
  },
  {
    source: "Community: Secondhand Transactions",
    title: "Selling TI graphing calculator in good condition",
    description: "Includes cover and extra batteries. Available for pickup after study hall.",
    author: "3-2 H. Lee",
    time: "1h ago",
    comments: 5,
    likes: 6,
  },
  {
    source: "Community: Secondhand Transactions",
    title: "Selling TI graphing calculator in good condition",
    description: "Includes cover and extra batteries. Available for pickup after study hall.",
    author: "3-2 H. Lee",
    time: "1h ago",
    comments: 5,
    likes: 6,
  },
]

const recentlyViewedPosts = [
  {
    title: "How to prepare for next week's chemistry quiz efficiently",
    source: "Community: Study Tips",
  },
  {
    title: "Dorm laundry room etiquette reminder for all grade levels",
    source: "Group: Student Council",
  },
  {
    title: "Lost USB drive found near auditorium back entrance",
    source: "Community: Lost Gadgets",
  },
  {
    title: "Weekend self-study room reservation schedule announced",
    source: "Group: Academic Office",
  },
]

export default function AppHomePage() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="flex min-w-0 flex-col gap-1">
        <h1 className="px-4 py-1 text-xl font-semibold sm:text-2xl">Posts</h1>
        <Separator className="my-1" />
        <FeedPostList items={feedItems} className="flex flex-col" />
      </section>

      <aside className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-medium tracking-wide">Recently Viewed</h2>
          <Button
            variant="ghost"
            size="xs"
            disabled={recentlyViewedPosts.length === 0}
            className="text-muted-foreground"
          >
            Clear
          </Button>
        </div>
        <Separator />
        {recentlyViewedPosts.length > 0 ? (
          <ul className="divide-border divide-y">
            {recentlyViewedPosts.map((post, index) => (
              <li key={`${post.source}-${post.title}-${index}`} className="px-1 py-3 first:pt-0">
                <p className="line-clamp-2 text-xs leading-5 font-medium">{post.title}</p>
                <p className="text-muted-foreground mt-1 text-xs">{post.source}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No recently viewed posts.</p>
        )}
      </aside>
    </div>
  )
}
