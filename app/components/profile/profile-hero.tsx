import {
  BedDoubleIcon,
  Building2Icon,
  ImageIcon,
  MessageCircleIcon,
  PencilIcon,
  PhoneIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { useRef, type ComponentType } from "react"
import { Link } from "react-router"

import { useImageCrop } from "~/hooks/use-image-crop"
import { useImageDraft } from "~/hooks/use-image-draft"
import { ImageCropper } from "~/components/image/image-cropper"
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { formatPhoneNumber, profileInitials } from "~/lib/profile/format"
import { GENDER_LABEL, PROFILE_TYPE_LABEL, TRACK_LABEL, type MyProfile } from "~/lib/profile/types"
import { cn } from "~/lib/utils"

const AVATAR_CROP = { aspect: 1, maxOutputEdge: 512 }
const COVER_CROP = { aspect: 3, maxOutputEdge: 1600 }

function identityFacts(profile: MyProfile): string[] {
  const facts: string[] = []
  if (profile.cohort !== null) facts.push(`${profile.cohort}기`)
  if (profile.type !== "teacher" && profile.track !== null) facts.push(TRACK_LABEL[profile.track])
  if (profile.type !== "teacher" && profile.gender !== null)
    facts.push(GENDER_LABEL[profile.gender])
  return facts
}

type MetaFact = { icon: ComponentType<{ className?: string }>; label: string; value: string }

function metaFacts(profile: MyProfile): MetaFact[] {
  const facts: MetaFact[] = []
  if (profile.department !== null)
    facts.push({ icon: Building2Icon, label: "부서", value: profile.department })
  if (profile.dorm_room !== null)
    facts.push({ icon: BedDoubleIcon, label: "방", value: `${profile.dorm_room}호` })
  return facts
}

// meta·전화는 데스크톱에선 이름 컬럼 안, 모바일에선 그 아래 별도 줄로 위치가 갈린다. 배치만
// 다르고 내용은 같아서, 표시 className만 바꿔 두 자리에 같은 컴포넌트를 건다.
function MetaFacts({ facts, className }: { facts: MetaFact[]; className?: string }) {
  return (
    <dl
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm",
        className
      )}
    >
      {facts.map((fact, index) => (
        <div key={fact.label} className="flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden="true" className="bg-border h-3 w-px" /> : null}
          <fact.icon className="size-4 shrink-0" aria-hidden="true" />
          <dt className="sr-only">{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function PhoneLink({ phoneNumber, className }: { phoneNumber: string; className?: string }) {
  return (
    <a
      href={`tel:${phoneNumber}`}
      className={cn(
        "text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors",
        className
      )}
    >
      <PhoneIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{formatPhoneNumber(phoneNumber)}</span>
    </a>
  )
}

export function ProfileHero({
  profile,
  avatarUrl,
  coverUrl,
  isMe,
  editTo,
}: {
  profile: MyProfile
  avatarUrl: string | null
  coverUrl: string | null
  isMe: boolean
  editTo: string
}) {
  const [cover, replaceCover] = useImageDraft(coverUrl, profile.id)
  const [avatar, replaceAvatar] = useImageDraft(avatarUrl, profile.id)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const avatarCrop = useImageCrop({
    onCropped: (file) => replaceAvatar(URL.createObjectURL(file)),
  })
  const coverCrop = useImageCrop({
    onCropped: (file) => replaceCover(URL.createObjectURL(file)),
  })

  const identity = identityFacts(profile)
  const meta = metaFacts(profile)

  return (
    <section className="bg-card animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both overflow-hidden border-0 duration-500 motion-reduce:animate-none sm:border md:rounded-xl">
      <div className="from-primary/30 to-primary/5 relative aspect-[3/1] w-full overflow-hidden bg-linear-to-br lg:aspect-auto lg:h-72">
        {cover ? <img src={cover} alt="" className="size-full object-cover" /> : null}
        {isMe ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => coverInputRef.current?.click()}
              className="absolute top-3 right-3 shadow-sm sm:top-auto sm:bottom-3"
            >
              <ImageIcon data-icon="inline-start" aria-hidden="true" />
              <span className="max-sm:sr-only">커버 사진</span>
            </Button>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) coverCrop.start(file)
                event.target.value = ""
              }}
            />
          </>
        ) : null}
      </div>

      <div className="bg-card relative -mt-8 rounded-t-3xl p-4 sm:mt-0 sm:rounded-none sm:bg-transparent sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-5">
          <div className="flex min-w-0 items-start gap-4 sm:contents">
            <div className="relative -mt-12 w-fit shrink-0 sm:-mt-24">
              <Avatar className="ring-card size-[6.5rem] ring-4 sm:size-[8.5rem]">
                {avatar ? <AvatarImage src={avatar} alt="" className="object-cover" /> : null}
                <AvatarFallback className="text-3xl font-semibold">
                  {profileInitials(profile.name)}
                </AvatarFallback>
              </Avatar>
              {isMe ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
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
                      if (file) avatarCrop.start(file)
                      event.target.value = ""
                    }}
                  />
                </>
              ) : null}
            </div>

            <div className="min-w-0 flex-1 sm:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold">{profile.name}</h1>
                {profile.type === "student" ? null : (
                  <Badge variant={profile.type === "teacher" ? "teacher" : "secondary"}>
                    {PROFILE_TYPE_LABEL[profile.type]}
                  </Badge>
                )}
                {profile.role === "admin" ? (
                  <Badge variant="destructive" className="gap-1">
                    <ShieldCheckIcon
                      data-icon="inline-start"
                      className="size-3.5"
                      aria-hidden="true"
                    />
                    관리자
                  </Badge>
                ) : null}
              </div>

              {identity.length > 0 ? (
                <p className="text-muted-foreground mt-1.5 text-sm">{identity.join(" · ")}</p>
              ) : null}

              {meta.length > 0 ? <MetaFacts facts={meta} className="mt-2 hidden sm:flex" /> : null}

              {profile.phone_number ? (
                <PhoneLink phoneNumber={profile.phone_number} className="mt-2 hidden sm:flex" />
              ) : null}
            </div>
          </div>

          {meta.length > 0 ? <MetaFacts facts={meta} className="sm:hidden" /> : null}

          {profile.phone_number ? (
            <PhoneLink phoneNumber={profile.phone_number} className="sm:hidden" />
          ) : null}

          <div className="flex gap-2 sm:pb-1">
            {isMe ? (
              <Button asChild className="h-10 max-sm:flex-1">
                <Link to={editTo}>
                  <PencilIcon className="size-4" aria-hidden="true" />
                  프로필 편집
                </Link>
              </Button>
            ) : (
              /* TODO: DM 라우트가 연결되면 이 버튼을 대화 시작 Link로 바꾼다. */
              <Button type="button" variant="outline" className="h-10 max-sm:flex-1" disabled>
                <MessageCircleIcon className="size-4" aria-hidden="true" />
                메시지
              </Button>
            )}
          </div>
        </div>

        {profile.description ? (
          <p className="mt-4 max-w-2xl text-sm wrap-break-word break-keep whitespace-pre-wrap">
            {profile.description}
          </p>
        ) : null}
      </div>

      {avatarCrop.cropperProps ? (
        <ImageCropper
          {...avatarCrop.cropperProps}
          aspect={AVATAR_CROP.aspect}
          maxOutputEdge={AVATAR_CROP.maxOutputEdge}
          round
          title="프로필 사진"
        />
      ) : null}
      {coverCrop.cropperProps ? (
        <ImageCropper
          {...coverCrop.cropperProps}
          aspect={COVER_CROP.aspect}
          maxOutputEdge={COVER_CROP.maxOutputEdge}
          title="커버 사진"
        />
      ) : null}
    </section>
  )
}
