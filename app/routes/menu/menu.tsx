import {
  BellIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  FileTextIcon,
  KeyRoundIcon,
  LogOutIcon,
  PaletteIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersRoundIcon,
  UtensilsCrossedIcon,
} from "lucide-react"
import type { ComponentType, ReactNode } from "react"
import { Link, useSearchParams } from "react-router"

import { ThemeSelect } from "~/components/menu/theme-select"
import { ProfileAvatar } from "~/components/profile/profile-avatar"
import { Badge } from "~/components/ui/badge"
import { mockAppAdmins, mockPendingProfiles } from "~/lib/admin/mock-data"
import { mockProfile, mockProfileAvatarUrl, mockProfileEmail } from "~/lib/profile/mock-data"
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
  // TODO(backend): 로더가 profiles.role='admin'을 내려준다. permissions/user_permissions가 아니다 --
  // 그건 gongang/karaoke용 기능 플래그고, 가입 승인은 앱 관리자(profiles.role)가 가른다.
  const canApproveMembers = searchParams.get("as") === "admin"
  // TODO(backend): count_pending_profiles(). 0이면 배지를 띄우지 않는다 -- 빈 배지는 볼 것이
  // 있다고 거짓말한다.
  const pendingCount = mockPendingProfiles.length

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">메뉴</h1>

      <Link
        to="/profile"
        className="bg-card hover:bg-muted/60 flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
      >
        <ProfileAvatar
          profile={{ name: mockProfile.name, avatarUrl: mockProfileAvatarUrl }}
          className="size-12"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {mockProfile.name}
            {/* 기수는 학생에게만 있다(선생님·졸업생은 null). 없으면 아무것도 그리지 않는다. */}
            {mockProfile.cohort === null ? null : (
              <span className="text-muted-foreground ml-1.5 font-normal">
                {mockProfile.cohort}기
              </span>
            )}
          </p>
          <p className="text-muted-foreground truncate text-xs">{mockProfileEmail}</p>
        </div>
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </Link>

      <MenuSection title="계정">
        {/* 편집은 프로필 위에 뜨는 모달이라 프로필로 보낸다 -- /profile이 내 id로 redirect하고,
            거기서 "프로필 편집" 버튼이 모달을 연다. */}
        <MenuRow icon={UserRoundIcon} label="프로필" to="/profile" />
        <MenuRow icon={KeyRoundIcon} label="비밀번호 변경" to="/menu/password" />
        <MenuRow icon={BellIcon} label="알림 설정" to="/menu/notifications" />
      </MenuSection>

      <MenuSection title="화면">
        <MenuRow icon={PaletteIcon} label="테마" trailing={<ThemeSelect />} />
      </MenuSection>

      <MenuSection title="학교">
        <MenuRow icon={UtensilsCrossedIcon} label="오늘의 급식" to="/menu/meal" />
        <MenuRow icon={CalendarClockIcon} label="공강·노래방" to="/util/gongang" />
      </MenuSection>

      {canApproveMembers ? (
        <MenuSection title="관리">
          <MenuRow
            icon={ShieldCheckIcon}
            label="가입 승인"
            hint="승인 대기 중인 학생을 확인합니다"
            to="/admin/approvals"
            trailing={
              pendingCount > 0 ? (
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{pendingCount}</Badge>
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </span>
              ) : undefined
            }
          />
          <MenuRow
            icon={UsersRoundIcon}
            label="관리자"
            hint="가입 승인을 할 사람을 정합니다"
            to="/admin/admins"
            trailing={
              <span className="flex items-center gap-2">
                <Badge variant="secondary">{mockAppAdmins.length}</Badge>
                <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </span>
            }
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
