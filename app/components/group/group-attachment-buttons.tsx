import { ImageIcon, PaperclipIcon } from "lucide-react"
import type { ChangeEvent } from "react"
import { useRef } from "react"

import { Button } from "~/components/ui/button"

// 사진과 파일 첨부를 분리한다. 모바일/패드에서 accept="image/*"는 갤러리·카메라를,
// 일반 입력은 파일 브라우저를 연다(데스크톱은 어느 쪽이든 파일 대화상자라 차이 없음).
// 고른 파일은 MIME으로 미리보기/칩을 나누는 useFileAttachments가 처리한다.
export function GroupAttachmentButtons({
  onAdd,
  className,
}: {
  onAdd: (files: FileList | null) => void
  className?: string
}) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAdd(event.target.files)
    event.target.value = ""
  }

  return (
    <div className={className}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleChange}
      />
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleChange} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => imageInputRef.current?.click()}
      >
        <ImageIcon className="size-4" aria-hidden="true" />
        사진
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
      >
        <PaperclipIcon className="size-4" aria-hidden="true" />
        파일
      </Button>
    </div>
  )
}
