import { PowerIcon, SearchIcon, SettingsIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Link, useFetcher } from "react-router"

import { ClubCard } from "~/components/club/club-card"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { getClubPreviewRole, getMyClubAccess, withClubPreview } from "~/lib/club/access"
import { mockClubs } from "~/lib/club/mock-data"
import type { ClubType } from "~/lib/club/types"
import { createClient } from "~/lib/supabase/client"
import { cn } from "~/lib/utils"

import type { Route } from "./+types/index"

type ClubTab = "all" | ClubType

const tabs: { id: ClubTab; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "major", label: "수동" },
  { id: "general", label: "목동" },
]

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  const access = await getMyClubAccess()
  const previewRole = getClubPreviewRole(request)

  if (access.profileId === null) {
    return { ...access, pageOpen: true, previewRole }
  }

  const { data, error } = await createClient()
    .from("club_settings")
    .select("page_open")
    .eq("singleton", true)
    .single()

  if (error) {
    throw new Error(`동아리 페이지 설정을 확인하지 못했습니다. (${error.code})`, {
      cause: error,
    })
  }

  return { ...access, pageOpen: data.page_open, previewRole }
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  const access = await getMyClubAccess()
  if (!access.isAppAdmin || access.profileId === null) {
    throw new Response("앱 관리자만 동아리 페이지 설정을 변경할 수 있습니다.", {
      status: 403,
    })
  }

  const formData = await request.formData()
  const pageOpen = formData.get("pageOpen") === "true"
  const { error } = await createClient()
    .from("club_settings")
    .update({
      page_open: pageOpen,
      updated_by: access.profileId,
      updated_at: new Date().toISOString(),
    })
    .eq("singleton", true)

  if (error) {
    throw new Error(`동아리 페이지 설정을 변경하지 못했습니다. (${error.code})`, {
      cause: error,
    })
  }

  return { ok: true }
}

export default function ClubsPage({ loaderData }: Route.ComponentProps) {
  const adminMode = loaderData.isAppAdmin || loaderData.previewRole === "app-admin"
  const isAdminPreview = !loaderData.isAppAdmin && loaderData.previewRole === "app-admin"
  const pageSettingFetcher = useFetcher<typeof clientAction>()
  const [tab, setTab] = useState<ClubTab>("all")
  const [query, setQuery] = useState("")
  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const pageOpen = pageSettingFetcher.formData
    ? pageSettingFetcher.formData.get("pageOpen") === "true"
    : loaderData.pageOpen
  const pageSettingPending = pageSettingFetcher.state !== "idle"

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

  if (!adminMode && !pageOpen) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <header>
          <h1 className="text-2xl font-semibold">동아리</h1>
        </header>

        <section className="py-20 text-center">
          <h2 className="text-base font-semibold">동아리 페이지가 닫혀 있습니다.</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            동아리 모집 기간에 다시 확인해 주세요.
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">동아리</h1>
        {adminMode ? (
          <span className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
            <SettingsIcon aria-hidden />앱 관리자{isAdminPreview ? " 미리보기" : ""}
          </span>
        ) : loaderData.previewRole === "club-admin" ? (
          <span className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
            <SettingsIcon aria-hidden />
            동아리 관리자 미리보기
          </span>
        ) : null}
      </header>

      {adminMode ? (
        <section className="bg-card mt-5 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  pageOpen ? "bg-primary" : "bg-muted-foreground"
                )}
                aria-hidden
              />
              <h2 className="text-sm font-semibold">
                동아리 페이지 {pageOpen ? "공개 중" : "비공개"}
              </h2>
            </div>

            <p className="text-muted-foreground mt-1 text-xs">
              {pageOpen
                ? "학생들이 동아리 목록과 모집 공고를 볼 수 있습니다."
                : "앱 관리자 화면에서만 동아리 정보를 확인할 수 있습니다."}
            </p>
          </div>

          {pageOpen ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pageSettingPending || isAdminPreview}
              onClick={() => setCloseDialogOpen(true)}
            >
              <PowerIcon aria-hidden />
              페이지 닫기
            </Button>
          ) : (
            <pageSettingFetcher.Form method="post">
              <input type="hidden" name="pageOpen" value="true" />
              <Button type="submit" size="sm" disabled={pageSettingPending || isAdminPreview}>
                <PowerIcon aria-hidden />
                페이지 열기
              </Button>
            </pageSettingFetcher.Form>
          )}
        </section>
      ) : null}

      {!adminMode && myApplications.length > 0 ? (
        <section className="mt-5">
          <h2 className="text-muted-foreground text-xs font-semibold">내 지원</h2>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {myApplications.map((club) => (
              <Link
                key={club.id}
                to={withClubPreview(`/clubs/${club.slug}`, loaderData.previewRole)}
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
        <>
          <section className="mt-2 divide-y border-y">
            {clubs.map((club) => (
              <ClubCard key={club.id} club={club} previewRole={loaderData.previewRole} />
            ))}
          </section>
        </>
      ) : (
        <p className="text-muted-foreground py-16 text-center text-sm">검색 결과가 없습니다.</p>
      )}

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>동아리 페이지를 닫을까요?</DialogTitle>
            <DialogDescription>
              학생 화면에서는 동아리 목록과 모집 공고가 보이지 않습니다. 앱 관리자는 언제든 다시 열
              수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              취소
            </Button>
            <pageSettingFetcher.Form method="post" onSubmit={() => setCloseDialogOpen(false)}>
              <input type="hidden" name="pageOpen" value="false" />
              <Button type="submit" variant="destructive" disabled={pageSettingPending}>
                페이지 닫기
              </Button>
            </pageSettingFetcher.Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
