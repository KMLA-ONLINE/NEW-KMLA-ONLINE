import { MenuSubHeader } from "~/components/menu/menu-sub-header"

export default function LicensesPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <MenuSubHeader title="오픈소스 라이선스" />
      <div className="bg-card text-muted-foreground rounded-xl border p-4 text-sm leading-relaxed">
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
      </div>
    </div>
  )
}
