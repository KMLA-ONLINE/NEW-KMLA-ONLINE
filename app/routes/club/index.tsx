import { SearchIcon, ShieldCheckIcon, SlidersHorizontalIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router"

import { ClubCard } from "~/components/club/club-card"
import { ApplicationStatusBadge } from "~/components/club/club-status-badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { clubDivisionLabel } from "~/lib/club/format"
import { mockClubs } from "~/lib/club/mock-data"
import type { ClubDivision, ClubRecruitmentStatus } from "~/lib/club/types"
import { cn } from "~/lib/utils"

type DivisionFilter = "all" | ClubDivision
type RecruitmentFilter = "all" | "open" | "upcoming" | "finished"

const divisionFilters: {
  id: DivisionFilter
  label: string
}[] = [
  { id: "all", label: "전체" },
  { id: "sudo", label: clubDivisionLabel.sudo },
  { id: "mokdong", label: clubDivisionLabel.mokdong },
]

const recruitmentFilters: {
  id: RecruitmentFilter
  label: string
}[] = [
  { id: "all", label: "전체 상태" },
  { id: "open", label: "모집 중" },
  { id: "upcoming", label: "모집 예정" },
  { id: "finished", label: "마감 이후" },
]

function matchesRecruitmentFilter(status: ClubRecruitmentStatus | null, filter: RecruitmentFilter) {
  if (filter === "all") return true
  if (filter === "open") return status === "open"
  if (filter === "upcoming") return status === "upcoming"
  return status === "reviewing" || status === "announced" || status === "closed"
}

export default function ClubsPage() {
  const [searchParams] = useSearchParams()
  const adminMode = searchParams.get("as") === "admin"
  const [query, setQuery] = useState("")
  const [division, setDivision] = useState<DivisionFilter>("all")
  const [recruitment, setRecruitment] = useState<RecruitmentFilter>("all")

  const myApplications = mockClubs.filter((club) => club.myApplication !== null)

  const filteredClubs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR")

    return mockClubs.filter((club) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        club.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery) ||
        club.summary.toLocaleLowerCase("ko-KR").includes(normalizedQuery)

      const matchesDivision = division === "all" || club.division === division

      const matchesRecruitment = matchesRecruitmentFilter(
        club.recruitment?.status ?? null,
        recruitment
      )

      return matchesQuery && matchesDivision && matchesRecruitment
    })
  }, [division, query, recruitment])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">동아리</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            동아리 활동과 모집 일정을 확인하고 관리자에게 1:1로 지원할 수 있습니다.
          </p>
        </div>

        <Button variant="outline" asChild>
          <Link to={adminMode ? "/clubs" : "/clubs?as=admin"}>
            <ShieldCheckIcon aria-hidden />
            {adminMode ? "학생 화면 보기" : "관리자 화면 보기"}
          </Link>
        </Button>
      </header>

      {adminMode ? (
        <section className="bg-muted/60 flex items-start gap-3 rounded-xl border p-4">
          <ShieldCheckIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold">관리자 미리보기</p>
            <p className="text-muted-foreground mt-1 text-sm">
              각 동아리를 열면 공고 편집, 지원자 관리, 운영진 관리 시나리오가 표시됩니다.
            </p>
          </div>
        </section>
      ) : null}

      {myApplications.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            내 지원 현황
            <span className="text-muted-foreground ml-1.5 font-normal">
              {myApplications.length}
            </span>
          </h2>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {myApplications.map((club) => (
              <Link
                key={club.id}
                to={`/clubs/${club.id}`}
                className="bg-card hover:bg-muted/50 flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{club.name}</span>
                  <span className="text-muted-foreground mt-0.5 block truncate text-xs">
                    {club.myApplication?.note ?? "지원 상태를 확인하세요."}
                  </span>
                </span>

                {club.myApplication ? (
                  <ApplicationStatusBadge status={club.myApplication.status} />
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div className="relative max-w-xl">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            placeholder="동아리 이름이나 활동 내용 검색"
            aria-label="동아리 검색"
          />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center">
          <div className="text-muted-foreground flex items-center gap-2 text-xs font-semibold">
            <SlidersHorizontalIcon className="size-3.5" aria-hidden />
            필터
          </div>

          <div className="flex flex-wrap gap-2">
            {divisionFilters.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={division === item.id}
                onClick={() => setDivision(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  division === item.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background hover:bg-muted"
                )}
              >
                {item.label}
              </button>
            ))}

            <span className="bg-border my-1 hidden w-px sm:block" />

            {recruitmentFilters.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={recruitment === item.id}
                onClick={() => setRecruitment(item.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  recruitment === item.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background hover:bg-muted"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">
            동아리 목록
            <span className="text-muted-foreground ml-1.5 font-normal">{filteredClubs.length}</span>
          </h2>
          <p className="text-muted-foreground text-xs">Early 여부는 정보로만 표시합니다.</p>
        </div>

        {filteredClubs.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredClubs.map((club) => (
              <ClubCard key={club.id} club={club} adminMode={adminMode} />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-xl border px-4 py-12 text-center">
            <p className="text-sm font-semibold">조건에 맞는 동아리가 없습니다.</p>
            <p className="text-muted-foreground mt-1 text-sm">검색어나 필터를 변경해보세요.</p>
          </div>
        )}
      </section>
    </div>
  )
}
