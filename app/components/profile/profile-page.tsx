import type { ReactNode } from "react"
import { CameraIcon, MessageCircleIcon, UserRoundIcon } from "lucide-react"
import { Link } from "react-router"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardContent } from "~/components/ui/card"
import { Separator } from "~/components/ui/separator"

const profile = {
  name: "김민족",
  cohort: 30,
  initials: "김",
  description: "소개글입니다. 소개글입니다. 소개글입니다.",
  grade: 10,
  track: "국제반",
  classNo: 1,
  major: "생명공학, 유전공학",
  studentNumber: "251000",
  phoneNumber: "010-0000-0000",
  email: "minjok.kim@kmlaonline.kr",
  birthday: "2009-03-01",
  dormRoom: 305,
  dormSide: "좌방",
  department: "과기부",
  gender: "남자",
  info: [
    { label: "전공", value: "생명공학, 유전공학" },
    { label: "학번", value: "251000" },
    { label: "전화번호", value: "010-0000-0000" },
    { label: "이메일", value: "minjok.kim@kmlaonline.kr" },
    { label: "방", value: "305호 좌방" },
    { label: "부서", value: "과기부" },
    { label: "생일", value: "2009-03-01" },
    { label: "성별", value: "남자" },
  ],
}

const tabs = ["정보", "그룹", "게시물", "활동"]

export function ProfilePageContent() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <ProfileHero />
      <ProfileTabs />
      <ProfileInfoCard />
    </main>
  )
}

function ProfileHero() {
  return (
    <Card className="border-border/70 overflow-hidden p-0 shadow-xs">
      <div className="from-primary/14 via-primary/5 to-background relative h-32 border-b bg-gradient-to-r sm:h-40">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label="배경 사진 변경"
          className="ring-background absolute right-4 bottom-4 rounded-full shadow-sm ring-2 sm:right-6"
        >
          <CameraIcon className="size-4" />
        </Button>
      </div>
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
                  {profile.cohort}기
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">{profile.description}</p>
              <p className="text-muted-foreground text-xs sm:text-sm">
                {profile.grade}학년 {profile.track} | {profile.classNo}반
              </p>
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
    <div className="flex flex-col gap-3 sm:flex-row sm:pb-1">
      <Button asChild className="h-11 w-full px-5 sm:h-10 sm:w-auto">
        <Link to="/profile/edit">
          <UserRoundIcon className="size-4" />
          프로필 편집
        </Link>
      </Button>
      <Button type="button" variant="outline" className="h-11 w-full px-5 sm:h-10 sm:w-auto">
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
      <dl className="grid gap-3 text-sm sm:grid-cols-2 sm:gap-4">
        {profile.info.map((item) => (
          <div key={item.label} className="bg-muted/20 border-border/70 rounded-xl border p-4">
            <dt className="text-muted-foreground text-xs font-medium tracking-wide">
              {item.label}
            </dt>
            <dd className="mt-2 font-medium break-keep">{item.value}</dd>
          </div>
        ))}
      </dl>
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
