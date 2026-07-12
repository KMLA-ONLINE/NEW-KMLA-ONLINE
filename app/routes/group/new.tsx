import { XIcon } from "lucide-react"
import { useState } from "react"

import { FileDropOverlay } from "~/components/file-drop-overlay"
import { GroupAnonymousToggle } from "~/components/group/group-anonymous-toggle"
import { GroupAttachmentButtons } from "~/components/group/group-attachment-buttons"
import { GroupAttachmentPreview } from "~/components/group/group-attachment-preview"
import { GroupCategorySelect } from "~/components/group/group-category-select"
import { useFileAttachments } from "~/components/group/use-file-attachments"
import { useFileDrop } from "~/hooks/use-file-drop"
import { useModalClose } from "~/hooks/use-modal-close"
import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { mockGroup, mockGroupCategories } from "~/lib/group/mock-data"

// /groups/:pubId/new. 데스크톱은 모달, 모바일은 풀스크린(같은 Dialog를 반응형으로).
// 부모 group 라우트의 <Outlet/>에 얹혀 그 위에 뜬다. 저장은 백엔드 붙일 때.
export default function GroupNewPostPage() {
  // 열림 상태는 라우트가 정한다: 닫히면(X·배경·Esc·게시) 히스토리를 pop해 그룹으로 돌아간다.
  const close = useModalClose()

  // 제목/본문은 uncontrolled이라 타이핑엔 리렌더 없음. 첨부·카테고리만 로컬 상태. 저장은 백엔드 붙일 때.
  const { attachments, add, remove } = useFileAttachments()
  const { isDragging, dropHandlers } = useFileDrop(add)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  // posts.is_anonymous. 작성 시점에만 정해지고 그 뒤로는 불변이다(update 컬럼 grant에서 빠져 있다).
  // 그룹이 익명을 껐거나 내가 익명 정지 중이면 애초에 못 고른다 -- 로더가 파생해 내려줄 값이다.
  const canPostAnonymously = mockGroup.canPostAnonymously
  const suspendedUntil = mockGroup.anonymitySuspendedUntil
  const [anonymous, setAnonymous] = useState(false)

  const previewImages = attachments.flatMap((item) =>
    item.url ? [{ key: String(item.id), src: item.url, onRemove: () => remove(item.id) }] : []
  )
  const previewFiles = attachments.flatMap((item) =>
    item.url
      ? []
      : [
          {
            key: String(item.id),
            name: item.file.name,
            sizeBytes: item.file.size,
            onRemove: () => remove(item.id),
          },
        ]
  )

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[80svh] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-2xl"
        {...dropHandlers}
      >
        <DialogHeader className="flex-row items-center gap-2 border-b p-3 text-left">
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="닫기">
            <XIcon />
          </Button>
          <DialogTitle className="flex-1 text-base">게시물 작성</DialogTitle>
          <DialogDescription className="sr-only">
            {mockGroup.name}에 새 게시물을 작성합니다.
          </DialogDescription>
          <Button size="sm" onClick={close}>
            게시
          </Button>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
          {/* 아바타를 눌러 익명 ↔ 실명 전환. 작성할 때만 정할 수 있고 올린 뒤엔 못 바꾼다
              (is_anonymous가 update 컬럼 grant에 없다) -- 그래서 수정 화면엔 이 토글이 없다.
              그룹이 익명을 껐거나 내가 익명 정지 중이면 토글 자체가 없다: 서버 트리거가 어차피
              거부하므로, 누를 수 있게 두면 눌러놓고 나서야 실패하는 UI가 된다. */}
          <div className="flex items-center gap-2">
            {canPostAnonymously ? (
              <GroupAnonymousToggle
                anonymous={anonymous}
                onToggle={() => setAnonymous((value) => !value)}
                size="lg"
              />
            ) : (
              <Avatar size="lg">
                <AvatarFallback>나</AvatarFallback>
              </Avatar>
            )}
            <div className="text-sm leading-tight">
              <p className="font-semibold">{anonymous ? "익명" : "나"}</p>
              <p className="text-muted-foreground text-xs">
                {suspendedUntil
                  ? `익명 작성 제한 중 · ${new Date(suspendedUntil).toLocaleDateString("ko-KR")}까지`
                  : mockGroup.allowAnonymous
                    ? mockGroup.name
                    : `${mockGroup.name} · 익명 작성이 꺼져 있습니다`}
              </p>
            </div>
          </div>

          {/* shadcn Input/Textarea 대신 plain 요소 -- Textarea의 field-sizing-content가
              입력마다 레이아웃을 재계산해 렉을 유발한다(messenger 컴포저도 같은 이유로 회피). */}
          <input
            type="text"
            placeholder="제목"
            className="placeholder:text-muted-foreground my-2 border-0 bg-transparent p-0 text-2xl font-semibold outline-none md:my-3"
          />
          <textarea
            placeholder="내용을 입력하세요…"
            className="placeholder:text-muted-foreground min-h-40 flex-1 resize-none border-0 bg-transparent p-0 text-base outline-none"
          />

          <GroupAttachmentPreview images={previewImages} files={previewFiles} />
        </div>

        {/* 사진/파일 첨부 + 카테고리는 하단 고정 바에. 본문 textarea가 그 위를 flex-1로 채운다. */}
        <div className="flex items-center gap-2 border-t p-3">
          <GroupAttachmentButtons onAdd={add} className="flex gap-2" />
          <GroupCategorySelect
            categories={mockGroupCategories}
            selected={categoryId}
            onSelect={setCategoryId}
            className="ml-auto"
          />
        </div>

        {isDragging ? <FileDropOverlay /> : null}
      </DialogContent>
    </Dialog>
  )
}
