import { ImageIcon, MessageCircleIcon, PencilIcon, ShieldCheckIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router"

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { formatAffiliation, formatPhoneNumber, profileInitials } from "~/lib/profile/format"
import { PROFILE_TYPE_LABEL, type MyProfile } from "~/lib/profile/types"

// 고른 파일을 objectURL로 미리 보여준다. 갈아끼울 때와 이 화면이 unmount될 때 모두 이전 URL을
// 해제한다. SPA에선 문서가 닫히지 않으므로 마지막 URL을 cleanup하지 않으면 메모리에 남는다.
// 그룹 설정(group-settings)의 이미지 업로드와 같은 방식이다 -- 같은 앱에서 사진을 다른 방식으로
// 다룰 이유가 없다.
function useImageDraft(initial: string | null) {
  const [url, setUrl] = useState(initial)
  const objectUrlRef = useRef(initial?.startsWith("blob:") ? initial : null)

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    },
    []
  )

  const replace = (next: string | null) =>
    setUrl((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current)
      objectUrlRef.current = next?.startsWith("blob:") ? next : null
      return next
    })

  return [url, replace] as const
}

/**
 * 커버 배너 + 그 위로 겹친 아바타 + 액션 줄. 그룹 헤더(GroupHeader)와 같은 리듬이다 -- 같은
 * 앱에서 그룹과 사람이 서로 다른 모양의 머리를 이고 있을 이유가 없다.
 *
 * 사진을 바꾸는 버튼은 사진 위에 있다. 편집 모달 안에 넣으면 "커버를 바꾸려고 모달을 열어
 * 스크롤한다"가 되는데, 바꾸려는 대상이 이미 화면에 크게 떠 있는 상황에서 그건 한 단계 멀다.
 *
 * 사진은 카메라 촬영이 아니라 파일 업로드로 고른다 -- 그룹 설정과 같은 방식이다. 버튼을 누르면
 * 숨은 file input이 열리고, 고른 파일은 objectURL로 즉시 미리 보여준다.
 *
 * 본인이 아니면 업로드도 편집 버튼도 없다. 같은 화면을 남의 프로필에도 쓰기 때문에, 이 분기가
 * "내 프로필 화면"과 "남의 프로필 화면"이 갈라지지 않게 붙잡는 유일한 지점이다.
 */
export function ProfileHero({
  profile,
  avatarUrl,
  coverUrl,
  isMe,
}: {
  profile: MyProfile
  avatarUrl: string | null
  coverUrl: string | null
  isMe: boolean
}) {
  const affiliation = formatAffiliation(profile)
  const [cover, replaceCover] = useImageDraft(coverUrl)
  const [avatar, replaceAvatar] = useImageDraft(avatarUrl)
  // 파일 입력의 ref는 훅 밖에서 든다 -- 훅이 들면 렌더 중에 ref를 다시 읽는 모양이 되어
  // react-hooks가 잡는다. 오버레이 버튼이 이 입력을 대신 연다.
  const coverInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      {/* 커버가 없으면 그라디언트가 그대로 배너가 된다 -- 빈 회색 사각형보다 낫다. */}
      <div className="from-primary/30 to-primary/5 relative h-28 w-full overflow-hidden bg-linear-to-br sm:h-44">
        {cover ? <img src={cover} alt="" className="size-full object-cover" /> : null}
        {isMe ? (
          // TODO(backend): uploadProfileCover(supabase, file). accept는 선택창 힌트일 뿐이라
          // finalize_cover_image가 object의 mimetype을 jpeg/png/webp로 다시 대조한다.
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => coverInputRef.current?.click()}
              className="absolute right-3 bottom-3 shadow-sm"
            >
              <ImageIcon className="size-4" aria-hidden="true" />
              <span className="max-sm:sr-only">커버 사진</span>
            </Button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) replaceCover(URL.createObjectURL(file))
                // 같은 파일을 다시 골라도 change가 뜨도록 입력을 비운다.
                event.target.value = ""
              }}
            />
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="relative -mt-14 w-fit shrink-0 sm:-mt-20">
          <Avatar className="ring-card size-24 ring-4 sm:size-32">
            {/* 이름이 바로 옆에 있으니 장식이다 -- 스크린리더가 같은 말을 두 번 읽지 않게 alt는 비운다. */}
            {avatar ? <AvatarImage src={avatar} alt="" className="object-cover" /> : null}
            <AvatarFallback className="text-3xl font-semibold">
              {profileInitials(profile.name)}
            </AvatarFallback>
          </Avatar>
          {isMe ? (
            // TODO(backend): uploadAvatar(supabase, file). 커버와 같은 accept로 막고, mimetype
            // 최종 검증은 finalize RPC가 맡는다.
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                aria-label="프로필 사진 변경"
                onClick={() => avatarInputRef.current?.click()}
                className="ring-card absolute right-0 bottom-1 rounded-full shadow-sm ring-2"
              >
                <ImageIcon className="size-4" aria-hidden="true" />
              </Button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) replaceAvatar(URL.createObjectURL(file))
                  // 같은 파일을 다시 골라도 change가 뜨도록 입력을 비운다.
                  event.target.value = ""
                }}
              />
            </>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold">{profile.name}</h1>
            {/* 학생은 앱의 기본값이라 굳이 라벨을 달지 않는다. 선생님·졸업생만 표시한다. */}
            {profile.type === "student" ? null : (
              <Badge variant="secondary">{PROFILE_TYPE_LABEL[profile.type]}</Badge>
            )}
            {profile.role === "admin" ? (
              <Badge variant="secondary" className="gap-1">
                <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
                관리자
              </Badge>
            ) : null}
          </div>

          {affiliation ? (
            <p className="text-muted-foreground mt-1 truncate text-sm">{affiliation}</p>
          ) : null}
          {/* 이메일이 아니라 전화번호다. 이메일은 로그인 수단이라 계정 설정에 속하고, 학교 명부에서
              사람을 실제로 찾을 때 쓰는 건 번호다. 없는 사람도 있으므로(선택값) 없으면 줄이 빠진다. */}
          {profile.phone_number ? (
            <a
              href={`tel:${profile.phone_number}`}
              className="text-muted-foreground hover:text-foreground block truncate text-sm transition-colors"
            >
              {formatPhoneNumber(profile.phone_number)}
            </a>
          ) : null}
          {profile.description ? (
            <p className="mt-2 text-sm break-keep whitespace-pre-wrap">{profile.description}</p>
          ) : null}
        </div>

        <div className="flex gap-2 sm:pb-1">
          {isMe ? (
            <Button asChild className="h-10 max-sm:flex-1">
              {/* 모달이다. 라우트로 두면 주소가 남아 뒤로가기로 닫히고, 새로고침해도 열린 채다. */}
              <Link to="edit">
                <PencilIcon className="size-4" aria-hidden="true" />
                프로필 편집
              </Link>
            </Button>
          ) : (
            // TODO(backend): 1:1 대화방을 열거나 만든다(05-chat). 지금은 갈 곳이 없어 비활성이다.
            <Button type="button" variant="outline" className="h-10 max-sm:flex-1" disabled>
              <MessageCircleIcon className="size-4" aria-hidden="true" />
              메시지
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
