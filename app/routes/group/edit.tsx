import { XIcon } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { useParams } from "react-router"

import { FileDropOverlay } from "~/components/file-drop-overlay"
import { GroupAuthorAvatar } from "~/components/group/group-author-avatar"
import { GroupAttachmentButtons } from "~/components/group/group-attachment-buttons"
import { GroupAttachmentPreview } from "~/components/group/group-attachment-preview"
import { GroupCategorySelect } from "~/components/group/group-category-select"
import { GroupContentEditor } from "~/components/group/group-content-editor"
import { GroupDiscardDialog } from "~/components/group/group-discard-dialog"
import { useFileAttachments } from "~/components/group/use-file-attachments"
import { useCloseConfirmation } from "~/hooks/use-close-confirmation"
import { useFileDrop } from "~/hooks/use-file-drop"
import { useModalClose } from "~/hooks/use-modal-close"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { mockGroup, mockGroupCategories, mockGroupPosts } from "~/lib/group/mock-data"

// /groups/:pubId/posts/:postId/edit. 작성(new)과 같은 폼을 기존 값으로 채운 수정 화면.
// 제목/본문은 uncontrolled(defaultValue)라 타이핑엔 리렌더 없음. 저장은 백엔드 붙일 때.
export default function GroupEditPostPage() {
  const { pubId, postId } = useParams()
  // 닫으면 히스토리를 pop한다(뒤로가기로 수정 화면이 되살아나지 않게). 딥링크(직접 진입)면
  // ".."가 그룹으로 가버리므로 게시물 상세를 명시적 fallback으로 준다(edit는 posts/:postId의
  // 형제 라우트라 route-relative ".."로는 상세에 못 간다).
  const close = useModalClose(`/groups/${pubId}/posts/${postId}`)
  const post = mockGroupPosts.find((item) => item.pubId === postId)
  // 익명 글은 서버가 author를 지워서 내려준다(is_anonymous면 null). 내 글인 건 is_mine으로 따로 안다.
  const isAnonymous = post !== undefined && post.author === null

  // 제목/본문은 uncontrolled(defaultValue)라 타이핑엔 리렌더 없음. ref는 닫으려 할 때 딱 한 번,
  // 원래 값과 달라졌는지만 읽는다 -- 매 입력마다 리렌더를 만들지 않는다.
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  // 기존 첨부는 삭제 가능하도록 로컬 상태로, 새로 고른 파일은 훅이 관리한다.
  const [images, setImages] = useState(post?.images ?? [])
  const [files, setFiles] = useState(post?.files ?? [])
  const { attachments: newAttachments, add: addNew, remove: removeNew } = useFileAttachments()
  const { isDragging, dropHandlers } = useFileDrop(addNew)
  const [categoryId, setCategoryId] = useState<number | null>(post?.category?.id ?? null)

  const checkIsDirty = useCallback(
    () =>
      post !== undefined &&
      ((titleRef.current?.value ?? "") !== post.title ||
        (contentRef.current?.value ?? "") !== post.content ||
        images.length !== (post.images?.length ?? 0) ||
        files.length !== (post.files?.length ?? 0) ||
        newAttachments.length > 0 ||
        categoryId !== (post.category?.id ?? null)),
    [post, images.length, files.length, newAttachments.length, categoryId]
  )

  // X·배경·Esc가 결국 부르는 close()(navigate)를 useBlocker가 가로챈다: 뒤로가기·다른 곳으로의
  // 이동도 같은 확인 다이얼로그로 잡힌다. "저장" 버튼만 allowNextClose로 이 확인을 건너뛴다
  // (성공적으로 나가는 길이라 막으면 안 된다).
  const { isConfirmingDiscard, allowNextClose, confirmDiscard, cancelDiscard } =
    useCloseConfirmation(checkIsDirty)

  const previewImages = [
    ...images.map((image, index) => ({
      key: `existing-image-${index}`,
      src: image.src,
      onRemove: () => setImages((prev) => prev.filter((_, i) => i !== index)),
    })),
    ...newAttachments.flatMap((item) =>
      item.url
        ? [{ key: `new-image-${item.id}`, src: item.url, onRemove: () => removeNew(item.id) }]
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
    ...newAttachments.flatMap((item) =>
      item.url
        ? []
        : [
            {
              key: `new-file-${item.id}`,
              name: item.file.name,
              sizeBytes: item.file.size,
              onRemove: () => removeNew(item.id),
            },
          ]
    ),
  ]

  return (
    <>
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
            {/* TODO(backend): update_post RPC 연동 시 성공 응답을 받은 뒤에만 close()를 부른다.
                실패하면 모달을 닫지 않고 수정 중인 값을 그대로 유지해야 한다. */}
            <Button
              size="sm"
              onClick={() => {
                allowNextClose()
                close()
              }}
            >
              저장
            </Button>
          </DialogHeader>

          {post ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
                {/* 여기엔 익명 토글이 없다. is_anonymous는 작성 시점에만 정해지고 update 컬럼
                    grant에서 빠져 있어 서버가 전환을 받아주지 않는다 -- 익명으로 쓴 글을 나중에
                    실명으로 까거나, 실명 글을 뒤늦게 익명으로 숨기는 걸 둘 다 막기 위해서다.
                    글이 익명이면(author가 null) 그 사실만 보여준다. */}
                <div className="flex items-center gap-3">
                  <GroupAuthorAvatar name="나" anonymous={isAnonymous} size="lg" />
                  <div className="text-sm leading-tight">
                    <p className="font-semibold">{isAnonymous ? "익명" : "나"}</p>
                    <p className="text-muted-foreground text-xs">{mockGroup.name}</p>
                  </div>
                </div>

                <input
                  ref={titleRef}
                  type="text"
                  defaultValue={post.title}
                  placeholder="제목"
                  className="placeholder:text-muted-foreground my-2 border-0 bg-transparent p-0 text-2xl font-semibold outline-none md:my-3"
                />
                <GroupContentEditor contentRef={contentRef} defaultValue={post.content} />

                <GroupAttachmentPreview images={previewImages} files={previewFiles} />
              </div>

              {/* 사진/파일 첨부 + 카테고리는 하단 고정 바에. 본문 textarea가 그 위를 flex-1로 채운다. */}
              <div className="flex items-center gap-2 border-t p-3">
                <GroupAttachmentButtons onAdd={addNew} className="flex gap-2" />
                <GroupCategorySelect
                  categories={mockGroupCategories}
                  selected={categoryId}
                  onSelect={setCategoryId}
                  className="ml-auto"
                />
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

      <GroupDiscardDialog
        open={isConfirmingDiscard}
        onCancel={cancelDiscard}
        onDiscard={confirmDiscard}
        title="수정을 취소할까요?"
        description="변경한 내용이 저장되지 않고 사라져요."
        discardLabel="변경 취소"
      />
    </>
  )
}
