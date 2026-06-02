import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

export default function MenuPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Menu</CardTitle>
          <CardDescription>List of additional features will appear here.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No Additional features yet in this development build.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
