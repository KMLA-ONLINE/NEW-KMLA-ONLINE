import { SpaceDirectoryCard } from "~/components/layout/space-directory-card"
import { Input } from "~/components/ui/input"

const groupSpaces = [
  {
    name: "Student Council",
    category: "School Office",
    description: "Official notices for events, campaigns, and student body operations.",
    latestActivity: "12m ago",
  },
  {
    name: "Academic Office",
    category: "Administration",
    description: "Academic calendar updates, exam notices, and curriculum guidance.",
    latestActivity: "35m ago",
  },
  {
    name: "Dormitory Management",
    category: "Residential",
    description: "Dorm policies, maintenance alerts, and residential life announcements.",
    latestActivity: "1h ago",
  },
  {
    name: "Debate Club",
    category: "Club",
    description: "Meeting schedules, tournament preparations, and member coordination.",
    latestActivity: "2h ago",
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
