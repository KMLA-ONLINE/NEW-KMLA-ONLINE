import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Account overview, memberships, and recent activity.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Profile details will be connected in a later iteration.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
