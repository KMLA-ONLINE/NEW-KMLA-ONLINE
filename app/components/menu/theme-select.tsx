import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "~/components/ui/button"
import { useHydrated } from "~/lib/use-hydrated"
import { cn } from "~/lib/utils"

const OPTIONS = [
  { value: "system", label: "시스템", icon: MonitorIcon },
  { value: "light", label: "라이트", icon: SunIcon },
  { value: "dark", label: "다크", icon: MoonIcon },
] as const

// 게시물 보기 토글(PostViewToggle)과 같은 언어의 세그먼트. 취향이 브라우저에 사는 것도 같다.
export function ThemeSelect() {
  const { theme, setTheme } = useTheme()
  // 서버는 이 기기의 테마를 모른다(localStorage에 있다). 하이드레이션 전에 눌린 칸을 그리면
  // 서버 마크업과 어긋나므로, 그때까지는 아무것도 안 눌린 것으로 둔다.
  const hydrated = useHydrated()

  return (
    <div
      role="group"
      aria-label="테마"
      className="bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = hydrated && theme === value
        return (
          <Button
            key={value}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={active}
            onClick={() => setTheme(value)}
            className={cn(
              active
                ? "bg-background text-foreground hover:bg-background shadow-sm"
                : "text-muted-foreground"
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{label}</span>
          </Button>
        )
      })}
    </div>
  )
}
