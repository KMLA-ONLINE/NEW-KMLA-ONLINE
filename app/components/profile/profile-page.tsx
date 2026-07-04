import type { ReactNode } from "react"
import { CameraIcon, MessageCircleIcon, UserRoundIcon } from "lucide-react"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"

const profile = {
  name: "김민족",
  cohort: "30기",
  initials: "김",
  introduction: "소개글입니다. 소개글입니다. 소개글입니다.",
  meta: "10학년 국제반  |  그룹 nn",
  info: [
    { label: "전공", value: "생명공학, 유전공학" },
    { label: "전화번호", value: "010-0000-0000" },
    { label: "행정반", value: "0반" },
    { label: "방", value: "000호 좌방" },
    { label: "부서", value: "과기부" },
  ],
  groups: ["과학기술부", "생명과학 연구회"],
}

const tabs = ["정보", "그룹", "게시물", "활동"]

export function ProfilePageContent() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <ProfileHero />
      <ProfileTabs />
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ProfileInfoCard />
        <ProfileActivityCard />
      </section>
      <ProfileGroupsCard />
    </main>
  )
}

function ProfileHero() {
  return (
    <Card className="border-border/70 overflow-hidden p-0 shadow-xs">
      <div className="from-primary/14 via-primary/5 to-background h-32 border-b bg-gradient-to-r sm:h-40" />
      <CardContent className="px-4 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-14 flex flex-col gap-4 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3">
            <div className="relative w-fit">
              <Avatar className="ring-background bg-background size-28 ring-4 sm:size-24">
                <AvatarFallback className="text-3xl font-semibold sm:text-2xl">
                  {profile.initials}
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                aria-label="프로필 사진 변경"
                className="ring-background absolute right-1 bottom-1 rounded-full ring-2"
              >
                <CameraIcon className="size-3" />
              </Button>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
                  {profile.name}
                </h1>
                <Badge variant="secondary" className="h-6 rounded-md px-2.5 text-sm">
                  {profile.cohort}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">{profile.introduction}</p>
              <p className="text-muted-foreground text-xs sm:text-sm">{profile.meta}</p>
            </div>
          </div>

          <ProfileActions />
        </div>
      </CardContent>
    </Card>
  )
}

function ProfileActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:pb-1">
      <Button type="button" className="h-11 px-5 sm:h-10">
        <UserRoundIcon className="size-4" />
        프로필 편집
      </Button>
      <Button type="button" variant="outline" className="h-11 px-5 sm:h-10">
        <MessageCircleIcon className="text-primary size-4" />
        메시지
      </Button>
    </div>
  )
}

function ProfileTabs() {
  return (
    <div
      role="tablist"
      aria-label="프로필 섹션"
      className="bg-background/95 sticky top-14 z-10 grid grid-cols-4 border-b md:static md:rounded-xl md:border md:px-2"
    >
      {tabs.map((tab, index) => {
        const isSelected = index === 0

        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={`relative h-12 text-sm font-medium transition-colors sm:text-base ${
              isSelected ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
            {isSelected ? (
              <span className="bg-primary absolute inset-x-5 bottom-0 h-0.5 rounded-full" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function ProfileInfoCard() {
  return (
    <ProfileSectionCard title="정보">
      <dl className="grid gap-4 text-sm sm:grid-cols-[7rem_1fr]">
        {profile.info.map((item) => (
          <div key={item.label} className="grid grid-cols-[7rem_1fr] gap-3 sm:contents">
            <dt className="text-muted-foreground font-medium">{item.label}</dt>
            <dd className="font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>
      <Button type="button" variant="outline" className="mt-5 h-9 w-full">
        더보기
      </Button>
    </ProfileSectionCard>
  )
}

function ProfileActivityCard() {
  return (
    <ProfileSectionCard title="활동">
      <div className="flex min-h-42 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
        <p className="text-muted-foreground text-sm">최근 활동은 아직 없습니다.</p>
        <p className="text-muted-foreground mt-2 text-xs">
          게시글과 댓글 활동이 생기면 이 영역에 표시됩니다.
        </p>
      </div>
    </ProfileSectionCard>
  )
}

function ProfileGroupsCard() {
  return (
    <ProfileSectionCard title="그룹">
      <div className="grid gap-3 sm:grid-cols-2">
        {profile.groups.map((group) => (
          <div key={group} className="border-border/70 rounded-lg border p-4">
            <p className="font-medium">{group}</p>
            <p className="text-muted-foreground mt-1 text-xs">소속 그룹</p>
          </div>
        ))}
      </div>
    </ProfileSectionCard>
  )
}

function ProfileSectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="border-border/70 gap-4">
      <CardContent className="px-4 sm:px-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <Separator className="mt-3" />
        </div>
        {children}
      </CardContent>
    </Card>
  )
}
