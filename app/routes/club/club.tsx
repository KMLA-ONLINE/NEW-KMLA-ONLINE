import {
  ArrowLeftIcon,
  CalendarClockIcon,
  CheckIcon,
  ExternalLinkIcon,
  MapPinIcon,
  MessageSquareTextIcon,
  SaveIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react"
import { useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import { toast } from "sonner"

import { ApplicationStatusBadge, RecruitmentStatusBadge } from "~/components/club/club-status-badge"
import { RichText } from "~/components/rich-text/rich-text"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Twemoji } from "~/components/ui/twemoji"
import {
  applicationStatusLabel,
  clubDivisionLabel,
  clubManagerRoleLabel,
  formatDateTime,
  formatRecruitmentPeriod,
  recruitmentStatusLabel,
} from "~/lib/club/format"
import { mockClubApplicantsByClubId, mockClubs } from "~/lib/club/mock-data"
import type {
  Club,
  ClubApplicant,
  ClubApplicantStatus,
  ClubRecruitmentStatus,
} from "~/lib/club/types"
import { cn } from "~/lib/utils"

type AdminTab = "announcement" | "applicants" | "managers"

const adminTabs: { id: AdminTab; label: string }[] = [
  { id: "announcement", label: "공고 편집" },
  { id: "applicants", label: "지원자" },
  { id: "managers", label: "운영진" },
]

export default function ClubPage() {
  const { clubId } = useParams()
  const [searchParams] = useSearchParams()
  const club = mockClubs.find((item) => item.id === clubId)
  const adminMode = searchParams.get("as") === "admin"

  const [adminTab, setAdminTab] = useState<AdminTab>("announcement")
  const [descriptionMarkdown, setDescriptionMarkdown] = useState(club?.descriptionMarkdown ?? "")
  const [announcementMarkdown, setAnnouncementMarkdown] = useState(
    club?.recruitment?.announcementMarkdown ?? ""
  )
  const [recruitmentStatus, setRecruitmentStatus] = useState<ClubRecruitmentStatus | "none">(
    club?.recruitment?.status ?? "none"
  )
  const [startsAt, setStartsAt] = useState(club?.recruitment?.startsAt.slice(0, 16) ?? "")
  const [endsAt, setEndsAt] = useState(club?.recruitment?.endsAt.slice(0, 16) ?? "")
  const [applicants, setApplicants] = useState<ClubApplicant[]>(
    club ? (mockClubApplicantsByClubId[club.id] ?? []) : []
  )

  if (!club) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Button variant="ghost" asChild className="w-fit">
          <Link to="/clubs">
            <ArrowLeftIcon aria-hidden />
            동아리 목록
          </Link>
        </Button>

        <section className="bg-card rounded-xl border p-8 text-center">
          <h1 className="text-lg font-semibold">동아리를 찾을 수 없습니다.</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            주소를 확인하거나 동아리 목록으로 돌아가세요.
          </p>
        </section>
      </div>
    )
  }

  const updateApplicant = (applicantId: string, status: ClubApplicantStatus) => {
    setApplicants((current) =>
      current.map((applicant) =>
        applicant.id === applicantId ? { ...applicant, status } : applicant
      )
    )
  }

  const closeRecruitment = () => {
    setRecruitmentStatus("reviewing")

    // TODO(backend): 모집 마감 시 이 round에 지원한 모든 인원을 조회해
    // 지원자용 단체 펨방을 만들거나, 관리자에게 생성 여부를 묻는 흐름을 추가한다.
    toast.success("모집을 마감하고 심사 중 상태로 변경했습니다.")
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <Button variant="ghost" asChild className="w-fit">
        <Link to={adminMode ? "/clubs?as=admin" : "/clubs"}>
          <ArrowLeftIcon aria-hidden />
          동아리 목록
        </Link>
      </Button>

      <ClubHeader club={club} adminMode={adminMode} />

      {adminMode ? (
        <section className="bg-muted/60 flex items-start gap-3 rounded-xl border p-4">
          <ShieldCheckIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">앱 관리자 미리보기</p>
            <p className="text-muted-foreground mt-1 text-sm">
              실제 권한은 앱 관리자와 동아리별 owner/admin/editor를 구분해야 합니다. 현재 화면은
              디자인 확인용 mock입니다.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/clubs/${club.id}`}>학생 화면</Link>
          </Button>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="flex min-w-0 flex-col gap-5">
          <section className="bg-card rounded-xl border p-5">
            <h2 className="text-base font-semibold">동아리 안내</h2>
            <RichText text={descriptionMarkdown} mode="block" className="mt-4 text-sm" />
          </section>

          {club.recruitment ? (
            <section className="bg-card rounded-xl border p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{club.recruitment.title}</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    작성자가 구성한 모집 공고입니다.
                  </p>
                </div>
                <RecruitmentStatusBadge
                  status={
                    recruitmentStatus === "none" ? club.recruitment.status : recruitmentStatus
                  }
                />
              </div>

              <RichText text={announcementMarkdown} mode="block" className="mt-4 text-sm" />
            </section>
          ) : (
            <section className="bg-card rounded-xl border p-5">
              <h2 className="text-base font-semibold">모집 공고</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                현재 열려 있거나 예정된 모집이 없습니다.
              </p>
            </section>
          )}
        </main>

        <aside className="flex flex-col gap-4">
          <RecruitmentPanel club={club} status={recruitmentStatus} />

          <section className="bg-card rounded-xl border p-4">
            <h2 className="text-sm font-semibold">운영진</h2>
            <div className="mt-3 flex flex-col gap-3">
              {club.managers.map((manager) => (
                <div key={manager.userId} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {manager.name}
                      {manager.cohort === null ? null : (
                        <span className="text-muted-foreground ml-1 font-normal">
                          {manager.cohort}기
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {clubManagerRoleLabel[manager.role]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {adminMode ? (
        <section className="bg-card overflow-hidden rounded-xl border">
          <header className="border-b px-4 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">동아리 관리</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  백엔드 없이 가능한 관리 시나리오를 확인합니다.
                </p>
              </div>
              <Badge variant="outline">mock only</Badge>
            </div>

            <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="동아리 관리 메뉴">
              {adminTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAdminTab(tab.id)}
                  aria-current={adminTab === tab.id ? "page" : undefined}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    adminTab === tab.id
                      ? "border-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground border-transparent"
                  )}
                >
                  {tab.label}
                  {tab.id === "applicants" ? (
                    <span className="text-muted-foreground ml-1">{applicants.length}</span>
                  ) : null}
                </button>
              ))}
            </nav>
          </header>

          <div className="p-4 sm:p-5">
            {adminTab === "announcement" ? (
              <AnnouncementEditor
                club={club}
                descriptionMarkdown={descriptionMarkdown}
                onDescriptionChange={setDescriptionMarkdown}
                announcementMarkdown={announcementMarkdown}
                onAnnouncementChange={setAnnouncementMarkdown}
                recruitmentStatus={recruitmentStatus}
                onRecruitmentStatusChange={setRecruitmentStatus}
                startsAt={startsAt}
                onStartsAtChange={setStartsAt}
                endsAt={endsAt}
                onEndsAtChange={setEndsAt}
                onCloseRecruitment={closeRecruitment}
              />
            ) : null}

            {adminTab === "applicants" ? (
              <ApplicantManager applicants={applicants} onUpdateApplicant={updateApplicant} />
            ) : null}

            {adminTab === "managers" ? <ManagerPanel club={club} /> : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ClubHeader({ club, adminMode }: { club: Club; adminMode: boolean }) {
  return (
    <header className="bg-card flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-start">
      <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-2xl text-3xl">
        <Twemoji text={club.emoji} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{club.name}</h1>
          <Badge variant="secondary">{clubDivisionLabel[club.division]}</Badge>
          {club.recruitment?.kind === "early" ? <Badge variant="outline">Early</Badge> : null}
          {adminMode ? <Badge variant="teacher">관리 가능</Badge> : null}
        </div>

        <p className="text-muted-foreground mt-2 text-sm leading-6">{club.summary}</p>

        <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <span className="flex items-center gap-1.5">
            <UsersRoundIcon className="size-3.5" aria-hidden />
            멤버 {club.memberCount}명
          </span>
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
    </header>
  )
}

function RecruitmentPanel({
  club,
  status,
}: {
  club: Club
  status: ClubRecruitmentStatus | "none"
}) {
  const recruitment = club.recruitment
  const effectiveStatus = status === "none" ? (recruitment?.status ?? null) : status
  const application = club.myApplication

  if (!recruitment || effectiveStatus === null) {
    return (
      <section className="bg-card rounded-xl border p-4">
        <h2 className="text-sm font-semibold">지원</h2>
        <p className="text-muted-foreground mt-2 text-sm">현재 진행 중인 모집이 없습니다.</p>
        <Button className="mt-4 w-full" disabled>
          지원할 수 없음
        </Button>
      </section>
    )
  }

  const canStartApplication = effectiveStatus === "open" && application === null

  return (
    <section className="bg-card rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">모집 정보</h2>
        <RecruitmentStatusBadge status={effectiveStatus} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground text-xs">모집 기간</dt>
          <dd className="mt-1 font-medium">
            {formatRecruitmentPeriod(recruitment.startsAt, recruitment.endsAt)}
          </dd>
        </div>

        <div>
          <dt className="text-muted-foreground text-xs">모집 인원</dt>
          <dd className="mt-1 font-medium">
            {recruitment.capacity === null ? "제한 없음" : `${recruitment.capacity}명`}
          </dd>
        </div>

        {recruitment.resultAt ? (
          <div>
            <dt className="text-muted-foreground text-xs">결과 발표</dt>
            <dd className="mt-1 font-medium">{formatDateTime(recruitment.resultAt)}</dd>
          </div>
        ) : null}
      </dl>

      {application ? (
        <div className="bg-muted/60 mt-4 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">내 지원 상태</p>
            <ApplicationStatusBadge status={application.status} />
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            {application.note ?? `${applicationStatusLabel[application.status]} 상태입니다.`}
          </p>
        </div>
      ) : null}

      {canStartApplication ? (
        <>
          <p className="text-muted-foreground mt-4 text-xs leading-5">
            지원서는 사이트에 저장하지 않습니다. 버튼을 누르면 동아리 관리자와의 1:1 대화로
            이동합니다.
          </p>
          <Button className="mt-3 w-full" asChild>
            <Link
              to={`/messenger?intent=club-apply&club=${club.id}&to=${club.managers[0]?.userId ?? ""}`}
            >
              <MessageSquareTextIcon aria-hidden />
              관리자에게 지원하기
            </Link>
          </Button>
        </>
      ) : (
        <Button className="mt-4 w-full" disabled>
          {effectiveStatus === "upcoming"
            ? "모집 시작 전"
            : effectiveStatus === "open"
              ? "이미 지원함"
              : effectiveStatus === "reviewing"
                ? "지원 마감"
                : effectiveStatus === "announced"
                  ? "결과 확인 완료"
                  : "모집 종료"}
        </Button>
      )}
    </section>
  )
}

function AnnouncementEditor({
  club,
  descriptionMarkdown,
  onDescriptionChange,
  announcementMarkdown,
  onAnnouncementChange,
  recruitmentStatus,
  onRecruitmentStatusChange,
  startsAt,
  onStartsAtChange,
  endsAt,
  onEndsAtChange,
  onCloseRecruitment,
}: {
  club: Club
  descriptionMarkdown: string
  onDescriptionChange: (value: string) => void
  announcementMarkdown: string
  onAnnouncementChange: (value: string) => void
  recruitmentStatus: ClubRecruitmentStatus | "none"
  onRecruitmentStatusChange: (value: ClubRecruitmentStatus | "none") => void
  startsAt: string
  onStartsAtChange: (value: string) => void
  endsAt: string
  onEndsAtChange: (value: string) => void
  onCloseRecruitment: () => void
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="flex flex-col gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-semibold">동아리 소개</span>
          <textarea
            value={descriptionMarkdown}
            onChange={(event) => onDescriptionChange(event.target.value)}
            rows={10}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-44 resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-3"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold">모집 공고</span>
          <textarea
            value={announcementMarkdown}
            onChange={(event) => onAnnouncementChange(event.target.value)}
            rows={10}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-44 resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-3"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-xs font-semibold">모집 상태</span>
            <select
              value={recruitmentStatus}
              onChange={(event) =>
                onRecruitmentStatusChange(event.target.value as ClubRecruitmentStatus | "none")
              }
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            >
              <option value="none">모집 없음</option>
              <option value="upcoming">모집 예정</option>
              <option value="open">모집 중</option>
              <option value="reviewing">심사 중</option>
              <option value="announced">결과 발표</option>
              <option value="closed">모집 종료</option>
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold">시작</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => onStartsAtChange(event.target.value)}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            />
          </label>

          <label className="grid gap-2">
            <span className="text-xs font-semibold">마감</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => onEndsAtChange(event.target.value)}
              className="border-input bg-background h-9 rounded-md border px-2 text-sm"
            />
          </label>
        </div>

        <div className="bg-muted/60 rounded-lg border p-3">
          <p className="text-sm font-semibold">지원 페이지 자동 닫힘</p>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            실제 구현에서는 서버 시간이 마감 시각을 지난 경우 지원 대화 생성 RPC가 거절해야 합니다.
            화면의 비활성화만으로 마감을 강제하지 않습니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => toast.success(`${club.name} 설정을 mock으로 저장했습니다.`)}>
            <SaveIcon aria-hidden />
            변경사항 저장
          </Button>
          <Button
            variant="outline"
            onClick={onCloseRecruitment}
            disabled={recruitmentStatus === "none"}
          >
            모집 마감 처리
          </Button>
        </div>
      </div>

      <section className="bg-muted/40 rounded-xl border p-4">
        <h3 className="text-sm font-semibold">미리보기</h3>
        <div className="bg-card mt-3 rounded-lg border p-4">
          <RichText text={descriptionMarkdown} mode="block" className="text-sm" />
        </div>
        <div className="bg-card mt-3 rounded-lg border p-4">
          <RichText text={announcementMarkdown} mode="block" className="text-sm" />
        </div>
      </section>
    </div>
  )
}

function ApplicantManager({
  applicants,
  onUpdateApplicant,
}: {
  applicants: ClubApplicant[]
  onUpdateApplicant: (applicantId: string, status: ClubApplicantStatus) => void
}) {
  if (applicants.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-semibold">아직 지원자가 없습니다.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          지원자는 관리자와의 1:1 대화를 시작한 뒤 이 목록에 연결됩니다.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {applicants.map((applicant) => (
        <article key={applicant.id} className="rounded-xl border p-4">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">
                {applicant.name}
                <span className="text-muted-foreground ml-1 font-normal">{applicant.cohort}기</span>
              </h3>
              <p className="text-muted-foreground mt-1 text-xs">
                {formatDateTime(applicant.submittedAt)} 지원
              </p>
            </div>
            <ApplicantStatusBadge status={applicant.status} />
          </header>

          <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
            <Link to={`/messenger?room=${applicant.conversationId}`}>
              <MessageSquareTextIcon aria-hidden />
              지원 대화 열기
              <ExternalLinkIcon aria-hidden />
            </Link>
          </Button>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateApplicant(applicant.id, "accepted")}
            >
              <CheckIcon aria-hidden />
              합격
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onUpdateApplicant(applicant.id, "rejected")}
            >
              <XIcon aria-hidden />
              불합격
            </Button>
          </div>
        </article>
      ))}
    </div>
  )
}

function ApplicantStatusBadge({ status }: { status: ClubApplicantStatus }) {
  const label: Record<ClubApplicantStatus, string> = {
    submitted: "접수",
    reviewing: "검토 중",
    accepted: "합격",
    rejected: "불합격",
  }

  const variant =
    status === "accepted" ? "teacher" : status === "rejected" ? "destructive" : "outline"

  return <Badge variant={variant}>{label[status]}</Badge>
}

function ManagerPanel({ club }: { club: Club }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {club.managers.map((manager) => (
          <article key={manager.userId} className="rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{manager.name}</h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  {manager.cohort === null ? "교직원" : `${manager.cohort}기`}
                </p>
              </div>
              <Badge variant="outline">{clubManagerRoleLabel[manager.role]}</Badge>
            </div>
          </article>
        ))}
      </div>

      <div className="bg-muted/60 rounded-xl border p-4">
        <h3 className="text-sm font-semibold">권한 구분</h3>
        <ul className="text-muted-foreground mt-2 space-y-1 text-xs leading-5">
          <li>대표 관리자: 소유권 이전과 전체 운영진 관리</li>
          <li>관리자: 모집 공고와 지원자 상태 관리</li>
          <li>공고 편집자: 동아리 소개와 모집 공고 편집</li>
        </ul>
      </div>

      <Button
        variant="outline"
        className="w-fit"
        onClick={() => toast.success("운영진 추가 화면을 여는 mock 동작입니다.")}
      >
        <UserPlusIcon aria-hidden />
        운영진 추가
      </Button>
    </div>
  )
}
