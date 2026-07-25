import {
  ArrowLeftIcon,
  CalendarClockIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  PencilIcon,
} from "lucide-react"
import { Link } from "react-router"

import { RichText } from "~/components/rich-text/rich-text"
import { Button } from "~/components/ui/button"
import { Twemoji } from "~/components/ui/twemoji"
import { getClubPreviewRole, getMyClubAccess, withClubPreview } from "~/lib/club/access"
import { clubTypeLabel, formatRecruitmentPeriod } from "~/lib/club/format"
import { mockClubApplicantsByClubSlug, mockClubs } from "~/lib/club/mock-data"

import type { Route } from "./+types/club"

export async function clientLoader({ params, request }: Route.ClientLoaderArgs) {
  const club = mockClubs.find((item) => item.slug === params.clubId)
  const access = await getMyClubAccess()
  const previewRole = getClubPreviewRole(request)

  return {
    club,
    previewRole,
    canManageClub:
      club !== undefined &&
      (access.isAppAdmin ||
        access.managedClubIds.includes(club.id) ||
        previewRole === "app-admin" ||
        previewRole === "club-admin"),
  }
}

export default function ClubPage({ loaderData }: Route.ComponentProps) {
  const { club, canManageClub, previewRole } = loaderData

  if (!club) {
    return <p className="py-16 text-center text-sm">동아리를 찾을 수 없습니다.</p>
  }

  const applicants = mockClubApplicantsByClubSlug[club.slug] ?? []

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to={withClubPreview("/clubs", previewRole)}>
          <ArrowLeftIcon aria-hidden />
          동아리
        </Link>
      </Button>

      <header className="mt-4 flex items-start gap-4">
        <div className="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">
          {club.imageUrl ? (
            <img src={club.imageUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-xl">
              <Twemoji text={club.emoji} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-2xl font-semibold">{club.name}</h1>
            <span className="text-muted-foreground text-sm">{clubTypeLabel[club.type]}</span>
          </div>

          <p className="text-muted-foreground mt-1 text-sm">{club.cardDescription}</p>

          <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <CalendarClockIcon className="size-3.5" aria-hidden />
              {club.meeting}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPinIcon className="size-3.5" aria-hidden />
              {club.location}
            </span>
          </div>
        </div>

        {canManageClub ? (
          <Button variant="outline" size="sm" asChild>
            <Link to={withClubPreview(`/clubs/${club.slug}/edit`, previewRole)}>
              <PencilIcon aria-hidden />
              편집
            </Link>
          </Button>
        ) : null}
      </header>

      <main className="mt-8 space-y-8">
        <RichText text={club.description ?? ""} mode="block" className="text-sm" />

        {club.recruitment ? (
          <section className="border-t pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{club.recruitment.name}</h2>
              <span
                className={
                  club.recruitment.isOpen
                    ? "text-primary text-sm font-semibold"
                    : "text-muted-foreground text-sm"
                }
              >
                {club.recruitment.isOpen ? "지원 가능" : "지원 마감"}
              </span>
            </div>

            <p className="text-muted-foreground mt-1 text-xs">
              {formatRecruitmentPeriod(club.recruitment.starts_at, club.recruitment.ends_at)}
            </p>

            <RichText
              text={club.recruitment.announcementMarkdown}
              mode="block"
              className="mt-4 text-sm"
            />

            {!canManageClub ? (
              club.myApplication ? (
                <Button variant="outline" className="mt-5" asChild>
                  <Link to={`/messenger/${club.myApplication.conversationId}`}>
                    <MessageSquareTextIcon aria-hidden />
                    대화 열기
                  </Link>
                </Button>
              ) : club.recruitment.isOpen ? (
                <Button className="mt-5" asChild>
                  <Link
                    to={`/messenger?intent=club-apply&club=${club.id}&to=${club.managers[0]?.id ?? ""}`}
                  >
                    <MessageSquareTextIcon aria-hidden />
                    지원하기
                  </Link>
                </Button>
              ) : (
                <Button className="mt-5" disabled>
                  지원 마감
                </Button>
              )
            ) : null}
          </section>
        ) : null}

        <section className="border-t pt-6">
          <h2 className="text-sm font-semibold">관리자</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {club.managers
              .map((manager) =>
                manager.cohort === null ? manager.name : `${manager.name} ${manager.cohort}기`
              )
              .join(" · ")}
          </p>
        </section>

        {canManageClub ? (
          <section className="border-t pt-6">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">지원자</h2>
              <span className="text-muted-foreground text-sm">{applicants.length}명</span>
            </div>

            {applicants.length > 0 ? (
              <div className="mt-3 divide-y">
                {applicants.map((applicant) => (
                  <div key={applicant.id} className="flex items-center gap-3 py-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {applicant.profile.name}
                      {applicant.profile.cohort === null ? null : (
                        <span className="text-muted-foreground ml-1 font-normal">
                          {applicant.profile.cohort}기
                        </span>
                      )}
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/messenger/${applicant.conversationId}`}>대화 열기</Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground mt-3 text-sm">아직 지원자가 없습니다.</p>
            )}

            {/* TODO: 모집이 끝나면 지원자 전원을 모아 단체 대화를 만드는 RPC를 연결한다. */}
          </section>
        ) : null}
      </main>
    </div>
  )
}
