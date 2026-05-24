import { SpaceDirectoryCard } from "~/components/layout/space-directory-card"
import { Input } from "~/components/ui/input"

const communitySpaces = [
  {
    name: "Anon Talk",
    category: "General",
    description: "Open discussions about daily campus life and student experiences.",
    latestActivity: "5m ago",
  },
  {
    name: "Lost Gadgets",
    category: "Help",
    description: "Post and recover misplaced electronics, accessories, and devices.",
    latestActivity: "21m ago",
  },
  {
    name: "Secondhand Transactions",
    category: "Marketplace",
    description: "Buy, sell, and exchange student-owned items with comments and updates.",
    latestActivity: "48m ago",
  },
  {
    name: "Study Tips",
    category: "Academics",
    description: "Share resources, exam prep methods, and productivity practices.",
    latestActivity: "1h ago",
  },
]

export default function CommunityPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Community</h1>
        <p className="text-muted-foreground text-sm">
          Explore categorized discussion spaces where students post and comment freely.
        </p>
      </section>
      <Input placeholder="Search community spaces" className="max-w-sm" />
      <section className="grid gap-3 md:grid-cols-2">
        {communitySpaces.map((space) => (
          <SpaceDirectoryCard key={space.name} {...space} />
        ))}
      </section>
    </div>
  )
}
