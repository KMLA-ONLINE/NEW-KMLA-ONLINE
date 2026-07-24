import { ArrowLeftIcon, EyeIcon, ImageIcon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react"
import { useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"

import { ImageCropper } from "~/components/image/image-cropper"
import { RichText } from "~/components/rich-text/rich-text"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { useImageCrop } from "~/hooks/use-image-crop"
import { useImageDraft } from "~/hooks/use-image-draft"
import { mockClubs } from "~/lib/club/mock-data"
import type { ClubManager } from "~/lib/club/types"
import { cn } from "~/lib/utils"

const CLUB_IMAGE_CROP = {
  aspect: 1,
  maxOutputEdge: 1024,
}

export default function ClubEditPage() {
  const { clubId } = useParams()
  const club = mockClubs.find((item) => item.slug === clubId)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [imageUrl, replaceImage] = useImageDraft(club?.imageUrl ?? null, club?.id)
  const imageCrop = useImageCrop({
    onCropped: (file) => replaceImage(URL.createObjectURL(file)),
  })

  const [cardDescription, setCardDescription] = useState(club?.cardDescription ?? "")
  const [descriptionMarkdown, setDescriptionMarkdown] = useState(club?.description ?? "")
  const [announcementMarkdown, setAnnouncementMarkdown] = useState(
    club?.recruitment?.announcementMarkdown ?? ""
  )
  const [isOpen, setIsOpen] = useState(club?.recruitment?.isOpen ?? false)
  const [startsAt, setStartsAt] = useState(club?.recruitment?.starts_at.slice(0, 16) ?? "")
  const [endsAt, setEndsAt] = useState(club?.recruitment?.ends_at.slice(0, 16) ?? "")
  const [managers, setManagers] = useState<ClubManager[]>(club?.managers ?? [])
  const [newManagerName, setNewManagerName] = useState("")
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!club) {
    return <p className="py-16 text-center text-sm">동아리를 찾을 수 없습니다.</p>
  }

  const addManager = () => {
    const name = newManagerName.trim()
    if (!name) return

    setManagers((current) => [
      ...current,
      {
        id: Date.now(),
        name,
        cohort: null,
      },
    ])
    setNewManagerName("")
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to={`/clubs/${club.slug}?as=admin`}>
          <ArrowLeftIcon aria-hidden />
          {club.name}
        </Link>
      </Button>

      <header className="mt-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">동아리 편집</h1>
        <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
          <EyeIcon aria-hidden />
          미리보기
        </Button>
      </header>

      <form
        className="mt-7 space-y-8"
        onSubmit={(event) => {
          event.preventDefault()
          toast.success("변경사항을 저장했습니다.")
        }}
      >
        <section>
          <Label>동아리 이미지</Label>
          <div className="mt-3 flex items-center gap-4">
            <div className="bg-muted grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <ImageIcon className="text-muted-foreground size-6" aria-hidden />
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => imageInputRef.current?.click()}
              >
                이미지 선택
              </Button>
              {imageUrl ? (
                <Button type="button" variant="ghost" onClick={() => replaceImage(null)}>
                  삭제
                </Button>
              ) : null}
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) imageCrop.start(file)
                event.target.value = ""
              }}
            />
          </div>
        </section>

        <label className="grid gap-2">
          <span className="text-sm font-semibold">목록 설명</span>
          <Input
            value={cardDescription}
            onChange={(event) => setCardDescription(event.target.value)}
            placeholder="목록에 표시할 한 줄 설명"
            maxLength={80}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-semibold">동아리 소개</span>
          <textarea
            value={descriptionMarkdown}
            onChange={(event) => setDescriptionMarkdown(event.target.value)}
            rows={12}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-56 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
          />
        </label>

        <section className="border-t pt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">지원 받기</h2>

            <button
              type="button"
              role="switch"
              aria-label="지원 받기"
              aria-checked={isOpen}
              onClick={() => setIsOpen((current) => !current)}
              className={cn(
                "focus-visible:ring-ring relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                isOpen ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "bg-background absolute top-0.5 left-0.5 size-5 rounded-full shadow-sm transition-transform",
                  isOpen ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid min-w-0 gap-2">
              <span className="text-xs font-semibold">시작</span>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                className="w-full min-w-0"
              />
            </label>

            <label className="grid min-w-0 gap-2">
              <span className="text-xs font-semibold">마감</span>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className="w-full min-w-0"
              />
            </label>
          </div>

          <label className="mt-5 grid gap-2">
            <span className="text-sm font-semibold">모집 공고</span>
            <textarea
              value={announcementMarkdown}
              onChange={(event) => setAnnouncementMarkdown(event.target.value)}
              rows={8}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 min-h-40 w-full resize-y rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
            />
          </label>
        </section>

        <section className="border-t pt-6">
          <h2 className="text-sm font-semibold">관리자</h2>

          <div className="mt-3 divide-y">
            {managers.map((manager) => (
              <div key={manager.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">
                  {manager.name}
                  {manager.cohort === null ? null : (
                    <span className="text-muted-foreground ml-1">{manager.cohort}기</span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setManagers((current) => current.filter((item) => item.id !== manager.id))
                  }
                >
                  <Trash2Icon aria-hidden />
                  해제
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <Input
              value={newManagerName}
              onChange={(event) => setNewManagerName(event.target.value)}
              placeholder="관리자 이름"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return
                event.preventDefault()
                addManager()
              }}
            />
            <Button type="button" variant="outline" onClick={addManager}>
              <PlusIcon aria-hidden />
              추가
            </Button>
          </div>
        </section>

        <Button type="submit">
          <SaveIcon aria-hidden />
          저장
        </Button>
      </form>

      {imageCrop.cropperProps ? (
        <ImageCropper
          {...imageCrop.cropperProps}
          aspect={CLUB_IMAGE_CROP.aspect}
          maxOutputEdge={CLUB_IMAGE_CROP.maxOutputEdge}
          title="동아리 이미지"
        />
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>미리보기</DialogTitle>
            <DialogDescription className="sr-only">
              현재 입력한 동아리 소개와 모집 공고를 확인합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-7">
            <div className="flex items-start gap-4">
              <div className="bg-muted grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-3xl">{club.emoji}</span>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-semibold">{club.name}</h2>
                <p className="text-muted-foreground mt-1 text-sm">{cardDescription}</p>
              </div>
            </div>

            <RichText text={descriptionMarkdown} mode="block" className="text-sm" />

            <section className="border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{club.recruitment?.name ?? "동아리 모집"}</h3>
                <span
                  className={
                    isOpen ? "text-primary text-sm font-semibold" : "text-muted-foreground text-sm"
                  }
                >
                  {isOpen ? "지원 가능" : "지원 마감"}
                </span>
              </div>
              <RichText text={announcementMarkdown} mode="block" className="mt-4 text-sm" />
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
