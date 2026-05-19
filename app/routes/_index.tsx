import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

export function meta() {
  return [
    { title: "KMLA Online" },
    {
      name: "description",
      content: "KMLA Online is the new school community app for Korean Minjok Leadership Academy.",
    },
  ]
}

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center px-6 py-12">
      <Card className="border-border/70 bg-card/95 w-full max-w-2xl shadow-sm">
        <CardHeader className="gap-3">
          <p className="text-primary text-sm font-semibold tracking-[0.2em] uppercase">
            KMLA Online
          </p>
          <CardTitle className="text-3xl sm:text-4xl">A new home for the KMLA community.</CardTitle>
          <CardDescription className="max-w-xl text-base leading-7">
            Stay connected with school announcements, conversations, and updates in one place.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="text-muted-foreground grid gap-3 text-sm sm:grid-cols-3">
            <div className="border-border/70 bg-background/60 rounded-lg border p-4">
              Announcements for the groups that matter to you.
            </div>
            <div className="border-border/70 bg-background/60 rounded-lg border p-4">
              Messaging and community posts for students and staff.
            </div>
            <div className="border-border/70 bg-background/60 rounded-lg border p-4">
              One account and one place to keep up with campus life.
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link to="/login">Sign in with Google</Link>
            </Button>
            <p className="text-muted-foreground text-sm">
              Early development build for the renewed KMLA app.
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
