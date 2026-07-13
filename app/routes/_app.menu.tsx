import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card"

export default function MenuPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
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

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>오픈소스 라이선스</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-2 text-sm leading-relaxed">
          <p>
            이모지 그래픽은{" "}
            <a
              href="https://github.com/jdecked/twemoji"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              Twemoji
            </a>{" "}
            (© Twitter, Inc 및 기여자들)를 사용하며,{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              CC-BY 4.0
            </a>{" "}
            라이선스를 따릅니다.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
