import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

type SpaceDirectoryCardProps = {
  name: string
  category: string
  description: string
  latestActivity: string
}

export function SpaceDirectoryCard({
  name,
  category,
  description,
  latestActivity,
}: SpaceDirectoryCardProps) {
  return (
    <Card className="border-border/70">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{name}</CardTitle>
          <Badge variant="outline">{category}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">Latest activity: {latestActivity}</p>
        <Button variant="outline" size="sm">
          Open
        </Button>
      </CardContent>
    </Card>
  )
}
