import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

/** Mirrors the columns of `public.spaces` a directory listing can actually read. */
export type SpaceDirectoryCardProps = {
  name: string
  type: "group" | "community"
  joinPolicy: "open" | "public" | "invite_only"
  description: string | null
  memberCount: number
}

const SPACE_TYPE_LABEL: Record<SpaceDirectoryCardProps["type"], string> = {
  group: "Group",
  community: "Community",
}

// What the join policy means to someone standing outside the space: `open` lets
// anyone read and post, `public` is visible but wants you to join first, and
// `invite_only` is not listed at all unless you already hold an invite.
const JOIN_ACTION_LABEL: Record<SpaceDirectoryCardProps["joinPolicy"], string> = {
  open: "Open",
  public: "Join",
  invite_only: "Invite only",
}

export function SpaceDirectoryCard({
  name,
  type,
  joinPolicy,
  description,
  memberCount,
}: SpaceDirectoryCardProps) {
  return (
    <Card className="border-border/70">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{name}</CardTitle>
          <Badge variant="outline">{SPACE_TYPE_LABEL[type]}</Badge>
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {memberCount.toLocaleString()} {memberCount === 1 ? "member" : "members"}
        </p>
        <Button variant="outline" size="sm" disabled={joinPolicy === "invite_only"}>
          {JOIN_ACTION_LABEL[joinPolicy]}
        </Button>
      </CardContent>
    </Card>
  )
}
