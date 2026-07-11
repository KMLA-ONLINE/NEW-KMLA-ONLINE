import {
  SpaceDirectoryCard,
  type SpaceDirectoryCardProps,
} from "~/components/layout/space-directory-card"
import { Input } from "~/components/ui/input"

// Stand-in rows of public.spaces, until a loader selects them.
const communitySpaces: SpaceDirectoryCardProps[] = [
  {
    name: "Anon Talk",
    type: "community",
    joinPolicy: "open",
    description: "Open discussions about daily campus life and student experiences.",
    memberCount: 412,
  },
  {
    name: "Lost Gadgets",
    type: "community",
    joinPolicy: "open",
    description: "Post and recover misplaced electronics, accessories, and devices.",
    memberCount: 268,
  },
  {
    name: "Secondhand Transactions",
    type: "community",
    joinPolicy: "public",
    description: "Buy, sell, and exchange student-owned items with comments and updates.",
    memberCount: 197,
  },
  {
    name: "Study Tips",
    type: "community",
    joinPolicy: "public",
    description: "Share resources, exam prep methods, and productivity practices.",
    memberCount: 83,
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
