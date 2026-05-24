import { Separator } from "~/components/ui/separator"
import { FeedPostList } from "~/components/layout/feed-post-list"

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

export default function AppHomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-1">
      <h1 className="px-4 py-1 text-xl font-semibold sm:text-2xl">Posts</h1>
      <Separator className="my-1" />
      <FeedPostList items={feedItems} className="flex flex-col" />
    </div>
  )
}
