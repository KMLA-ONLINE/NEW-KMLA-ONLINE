import {
  SpaceDirectoryCard,
  type SpaceDirectoryCardProps,
} from "~/components/layout/space-directory-card"
import { Input } from "~/components/ui/input"

// Stand-in rows of public.spaces, until a loader selects them.
const groupSpaces: SpaceDirectoryCardProps[] = [
  {
    name: "Student Council",
    type: "group",
    joinPolicy: "public",
    description: "Official notices for events, campaigns, and student body operations.",
    memberCount: 1204,
  },
  {
    name: "Academic Office",
    type: "group",
    joinPolicy: "public",
    description: "Academic calendar updates, exam notices, and curriculum guidance.",
    memberCount: 1187,
  },
  {
    name: "Dormitory Management",
    type: "group",
    joinPolicy: "public",
    description: "Dorm policies, maintenance alerts, and residential life announcements.",
    memberCount: 940,
  },
  {
    name: "Debate Club",
    type: "group",
    joinPolicy: "invite_only",
    description: "Meeting schedules, tournament preparations, and member coordination.",
    memberCount: 24,
  },
]

export default function GroupsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Groups</h1>
        <p className="text-muted-foreground text-sm">
          Browse official school spaces for announcements and categorized updates.
        </p>
      </section>
      <Input placeholder="Search group spaces" className="max-w-sm" />
      <section className="grid gap-3 md:grid-cols-2">
        {groupSpaces.map((space) => (
          <SpaceDirectoryCard key={space.name} {...space} />
        ))}
      </section>
    </div>
  )
}
