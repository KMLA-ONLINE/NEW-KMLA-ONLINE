import { XIcon } from "lucide-react"
import { useState } from "react"
import { useParams } from "react-router"

import { FileDropOverlay } from "~/components/file-drop-overlay"
import { GroupAttachmentButtons } from "~/components/group/group-attachment-buttons"
import { GroupAttachmentPreview } from "~/components/group/group-attachment-preview"
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
import { mockGroup, mockGroupPosts } from "~/lib/group/mock-data"

// /groups/:pubId/posts/:postId/edit. 작성(new)과 같은 폼을 기존 값으로 채운 수정 화면.
// 제목/본문은 uncontrolled(defaultValue)라 타이핑엔 리렌더 없음. 저장은 백엔드 붙일 때.
export default function GroupEditPostPage() {
  const { postId } = useParams()
  // 닫으면 히스토리를 pop한다(뒤로가기로 수정 화면이 되살아나지 않게). 딥링크면 게시물 상세로.
  const close = useModalClose()
  const post = mockGroupPosts.find((item) => item.pubId === postId)

  // 기존 첨부는 삭제 가능하도록 로컬 상태로, 새로 고른 파일은 훅이 관리한다.
  const [images, setImages] = useState(post?.images ?? [])
  const [files, setFiles] = useState(post?.files ?? [])
  const { attachments: newAttachments, add: addNew, remove: removeNew } = useFileAttachments()
  const { isDragging, dropHandlers } = useFileDrop(addNew)

  const previewImages = [
    ...images.map((image, index) => ({
      key: `existing-image-${index}`,
      src: image.src,
      onRemove: () => setImages((prev) => prev.filter((_, i) => i !== index)),
    })),
    ...newAttachments.flatMap((item, index) =>
      item.url
        ? [{ key: `new-image-${index}`, src: item.url, onRemove: () => removeNew(index) }]
        : []
    ),
  ]
  const previewFiles = [
    ...files.map((file, index) => ({
      key: `existing-file-${index}`,
      name: file.name,
      sizeBytes: file.sizeBytes,
      onRemove: () => setFiles((prev) => prev.filter((_, i) => i !== index)),
    })),
    ...newAttachments.flatMap((item, index) =>
      item.url
        ? []
        : [
            {
              key: `new-file-${index}`,
              name: item.file.name,
              sizeBytes: item.file.size,
              onRemove: () => removeNew(index),
            },
          ]
    ),
  ]

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[90svh] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-2xl"
        {...dropHandlers}
      >
        <DialogHeader className="flex-row items-center gap-2 border-b p-3 text-left">
          <Button variant="ghost" size="icon-sm" onClick={close} aria-label="닫기">
            <XIcon />
          </Button>
          <DialogTitle className="flex-1 text-base">게시물 수정</DialogTitle>
          <DialogDescription className="sr-only">게시물을 수정합니다.</DialogDescription>
          <Button size="sm" onClick={close}>
            저장
          </Button>
        </DialogHeader>

        {post ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <div className="flex items-center gap-2">
                <Avatar>
                  <AvatarFallback>나</AvatarFallback>
                </Avatar>
                <div className="text-sm leading-tight">
                  <p className="font-semibold">나</p>
                  <p className="text-muted-foreground text-xs">{mockGroup.name}</p>
                </div>
              </div>

              <input
                type="text"
                defaultValue={post.title}
                placeholder="제목"
                className="placeholder:text-muted-foreground my-2 border-0 bg-transparent p-0 text-2xl font-semibold outline-none md:my-3"
              />
              <textarea
                defaultValue={post.content}
                placeholder="내용을 입력하세요…"
                className="placeholder:text-muted-foreground min-h-40 flex-1 resize-none border-0 bg-transparent p-0 text-base outline-none"
              />

              <GroupAttachmentPreview images={previewImages} files={previewFiles} />
            </div>

            {/* 사진/파일 첨부는 하단 고정 바에. 본문 textarea가 그 위 공간을 flex-1로 채운다. */}
            <div className="border-t p-3">
              <GroupAttachmentButtons onAdd={addNew} className="flex gap-2" />
            </div>
          </>
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-10 text-sm">
            게시물을 찾을 수 없습니다.
          </div>
        )}

        {isDragging ? <FileDropOverlay /> : null}
      </DialogContent>
    </Dialog>
  )
}
