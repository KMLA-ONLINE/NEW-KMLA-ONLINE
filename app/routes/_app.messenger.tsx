import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

export default function MessengerPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Messenger</CardTitle>
          <CardDescription>Private conversations and group chats will appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No conversations yet in this development build.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
