import {
  BellIcon,
  ChevronRightIcon,
  FileTextIcon,
  KeyRoundIcon,
  LogOutIcon,
  PaletteIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UtensilsCrossedIcon,
} from "lucide-react"
import type { ComponentType, ReactNode } from "react"
import { Link, useSearchParams } from "react-router"

import { ThemeSelect } from "~/components/menu/theme-select"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { mockProfile } from "~/lib/profile/mock-data"
import { cn } from "~/lib/utils"

function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide">{title}</h2>
      <div className="bg-card divide-border/70 divide-y overflow-hidden rounded-xl border">
        {children}
      </div>
    </section>
  )
}

function MenuRow({
  icon: Icon,
  label,
  hint,
  to,
  trailing,
  disabled,
  destructive,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: string
  hint?: string
  /** 주면 행 전체가 링크가 된다. 안 주면 trailing 컨트롤을 품는 정적 행이다(예: 테마). */
  to?: string
  trailing?: ReactNode
  disabled?: boolean
  destructive?: boolean
}) {
  const body = (
    <>
      <Icon
        className={cn(
          "size-4.5 shrink-0",
          destructive ? "text-destructive" : "text-muted-foreground"
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn("block truncate text-sm font-medium", destructive && "text-destructive")}
        >
          {label}
        </span>
        {hint ? <span className="text-muted-foreground block truncate text-xs">{hint}</span> : null}
      </span>
      {trailing ??
        (to && !destructive ? (
          <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
        ) : null)}
    </>
  )

  const shared = "flex w-full items-center gap-3 px-4 py-3 text-left"
  if (to) {
    return (
      <Link to={to} className={cn(shared, "hover:bg-muted/60 transition-colors")}>
        {body}
      </Link>
    )
  }
  return <div className={cn(shared, disabled && "opacity-55")}>{body}</div>
}

export default function MenuPage() {
  const [searchParams] = useSearchParams()
  // 개발용 미리보기: ?as=admin 으로 운영 항목이 보이는 시점을 본다(group 라우트와 같은 규칙).
  // TODO(backend): private.has_permission(key)가 가른다. 아직 시드된 permission_key가 없다.
  const canApproveMembers = searchParams.get("as") === "admin"

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Link
        to="/profile"
        className="bg-card hover:bg-muted/60 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
      >
        <Avatar className="size-12">
          <AvatarFallback className="text-base">{mockProfile.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {mockProfile.name}
            <span className="text-muted-foreground ml-1.5 font-normal">{mockProfile.cohort}기</span>
          </p>
          <p className="text-muted-foreground truncate text-xs">{mockProfile.email}</p>
        </div>
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </Link>

      <MenuSection title="계정">
        <MenuRow icon={UserRoundIcon} label="프로필 편집" to="/profile/edit" />
        <MenuRow icon={KeyRoundIcon} label="비밀번호 변경" to="/profile/password" />
        <MenuRow icon={BellIcon} label="알림 설정" to="/menu/notifications" />
      </MenuSection>

      <MenuSection title="화면">
        <MenuRow icon={PaletteIcon} label="테마" trailing={<ThemeSelect />} />
      </MenuSection>

      <MenuSection title="학교">
        <MenuRow icon={UtensilsCrossedIcon} label="오늘의 급식" to="/menu/meal" />
      </MenuSection>

      {canApproveMembers ? (
        <MenuSection title="관리">
          {/* TODO(backend): 승인 대기 목록 + 승인/거절. 이 화면이 없으면 signup → OTP → pending
              다음 칸이 비어서 아무도 가입을 끝낼 수 없다. 지금은 입구만 잡아 둔다. */}
          <MenuRow
            icon={ShieldCheckIcon}
            label="가입 승인"
            hint="승인 대기 중인 학생을 확인합니다"
            trailing={<Badge variant="secondary">준비 중</Badge>}
            disabled
          />
        </MenuSection>
      ) : null}

      <MenuSection title="정보">
        <MenuRow icon={FileTextIcon} label="오픈소스 라이선스" to="/menu/licenses" />
      </MenuSection>

      {/* 로그아웃은 clientLoader가 브라우저에서 금고(IndexedDB의 encKey)까지 지운다. 그래서
          <a href>가 아니라 <Link>여야 한다 -- 문서 요청으로 가면 그 정리가 돌 기회가 없다. */}
      <div className="bg-card overflow-hidden rounded-xl border">
        <MenuRow icon={LogOutIcon} label="로그아웃" to="/logout" destructive />
      </div>
    </div>
  )
}
