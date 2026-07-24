import { SearchIcon, SettingsIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"

import { ClubCard } from "~/components/club/club-card"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { mockClubs } from "~/lib/club/mock-data"
import type { ClubType } from "~/lib/club/types"
import { cn } from "~/lib/utils"

type ClubTab = "all" | ClubType

const tabs: { id: ClubTab; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "major", label: "수동" },
  { id: "general", label: "목동" },
]

export default function ClubsPage() {
  const [searchParams] = useSearchParams()
  const adminMode = searchParams.get("as") === "admin"
  const [tab, setTab] = useState<ClubTab>("all")
  const [query, setQuery] = useState("")

  const clubs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR")

    return mockClubs.filter((club) => {
      const matchesTab = tab === "all" || club.type === tab
      const matchesQuery =
        normalizedQuery.length === 0 ||
        club.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery) ||
        club.cardDescription.toLocaleLowerCase("ko-KR").includes(normalizedQuery)

      return matchesTab && matchesQuery
    })
  }, [query, tab])

  const myApplications = mockClubs.filter((club) => club.myApplication !== null)

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">동아리</h1>
        <Button variant="ghost" size="sm" asChild>
          <Link to={adminMode ? "/clubs" : "/clubs?as=admin"}>
            <SettingsIcon aria-hidden />
            {adminMode ? "학생 화면" : "관리"}
          </Link>
        </Button>
      </header>

      {!adminMode && myApplications.length > 0 ? (
        <section className="mt-5">
          <h2 className="text-muted-foreground text-xs font-semibold">내 지원</h2>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {myApplications.map((club) => (
              <Link
                key={club.id}
                to={`/clubs/${club.slug}`}
                className="bg-muted hover:bg-muted/80 shrink-0 rounded-full px-3 py-1.5 text-sm font-medium"
              >
                {club.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="relative mt-5">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="동아리 검색"
          aria-label="동아리 검색"
          className="pl-9"
        />
      </div>

      <nav className="mt-4 flex border-b" aria-label="동아리 구분">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium",
              tab === item.id
                ? "border-foreground text-foreground"
                : "text-muted-foreground border-transparent"
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {clubs.length > 0 ? (
        <section className="mt-5 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
          {clubs.map((club) => (
            <ClubCard key={club.id} club={club} adminMode={adminMode} />
          ))}
        </section>
      ) : (
        <p className="text-muted-foreground py-16 text-center text-sm">검색 결과가 없습니다.</p>
      )}
    </div>
  )
}
