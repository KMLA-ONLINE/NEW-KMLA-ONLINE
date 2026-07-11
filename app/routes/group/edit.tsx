import { FileIcon, PaperclipIcon, XIcon } from "lucide-react"
import { useRef, useState } from "react"
import { useNavigate, useParams } from "react-router"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { formatFileSize } from "~/lib/group/format"
import { mockGroup, mockGroupPosts } from "~/lib/group/mock-data"

// /groups/:pubId/posts/:postId/edit. 작성(new)과 같은 폼을 기존 값으로 채운 수정 화면.
// 제목/본문은 uncontrolled(defaultValue)라 타이핑엔 리렌더 없음. 저장은 백엔드 붙일 때.
export default function GroupEditPostPage() {
  const { postId } = useParams()
  const navigate = useNavigate()
  // 닫으면 한 단계 위(게시물 상세)로 돌아간다.
  const close = () => navigate("..")
  const post = mockGroupPosts.find((item) => item.pubId === postId)

  // 기존 첨부는 삭제 가능하도록 로컬 상태로, 새로 고른 파일은 따로 보관한다.
  const [images, setImages] = useState(post?.images ?? [])
  const [files, setFiles] = useState(post?.files ?? [])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-xl"
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

            {images.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {images.map((image, index) => (
                  <div
                    key={`${image.src}-${index}`}
                    className="relative size-20 overflow-hidden rounded-lg border"
                  >
                    <img src={image.src} alt={image.alt} className="size-full object-cover" />
                    <button
                      type="button"
                      aria-label="이미지 삭제"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                      className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <XIcon className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {files.length > 0 || newFiles.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-2">
                {files.map((file, index) => (
                  <li
                    key={`existing-${index}`}
                    className="flex items-center gap-3 rounded-lg border p-2"
                  >
                    <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
                      <FileIcon className="text-muted-foreground size-4.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {formatFileSize(file.sizeBytes)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="첨부 삭제"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <XIcon />
                    </Button>
                  </li>
                ))}
                {newFiles.map((file, index) => (
                  <li
                    key={`new-${index}`}
                    className="flex items-center gap-3 rounded-lg border p-2"
                  >
                    <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
                      <FileIcon className="text-muted-foreground size-4.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-muted-foreground text-xs">{formatFileSize(file.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="첨부 삭제"
                      onClick={() => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <XIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) {
                    setNewFiles((prev) => [...prev, ...Array.from(event.target.files!)])
                  }
                  event.target.value = ""
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <PaperclipIcon className="size-4" aria-hidden="true" />
                파일 첨부
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground flex flex-1 items-center justify-center p-10 text-sm">
            게시물을 찾을 수 없습니다.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
