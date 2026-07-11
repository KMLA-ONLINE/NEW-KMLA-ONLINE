import { ImageIcon, XIcon } from "lucide-react"
import { useNavigate } from "react-router"

import { Avatar, AvatarFallback } from "~/components/ui/avatar"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { mockGroup } from "~/lib/group/mock-data"

// /groups/:pubId/new. 데스크톱은 모달, 모바일은 풀스크린(같은 Dialog를 반응형으로).
// 부모 group 라우트의 <Outlet/>에 얹혀 그 위에 뜬다. 저장은 백엔드 붙일 때.
export default function GroupNewPostPage() {
  const navigate = useNavigate()
  // 열림 상태는 라우트가 정한다: 닫히면(X·배경·Esc·게시) 그룹으로 되돌아간다.
  const close = () => navigate("..")

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
          <DialogTitle className="flex-1 text-base">게시물 작성</DialogTitle>
          <DialogDescription className="sr-only">
            {mockGroup.name}에 새 게시물을 작성합니다.
          </DialogDescription>
          <Button size="sm" onClick={close}>
            게시
          </Button>
        </DialogHeader>

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

          <div>
            <Button type="button" variant="outline" size="sm">
              <ImageIcon className="size-4" aria-hidden="true" />
              사진 추가
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
