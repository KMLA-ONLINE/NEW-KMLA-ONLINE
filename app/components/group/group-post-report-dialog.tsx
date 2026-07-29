import { useState, type FormEvent } from "react"

import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { Textarea } from "~/components/ui/textarea"
import { POST_REPORT_REASONS } from "~/lib/group/reports"
import type { GroupPostReportReason } from "~/lib/group/types"

export function GroupPostReportDialog({
  postTitle,
  open,
  onOpenChange,
  onSubmit,
}: {
  postTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (reason: GroupPostReportReason, details: string | null) => void
}) {
  const [reason, setReason] = useState<GroupPostReportReason>("spam")
  const [details, setDetails] = useState("")

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(reason, details.trim() || null)
    setReason("spam")
    setDetails("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>게시물 신고</DialogTitle>
            <DialogDescription className="line-clamp-2 [overflow-wrap:anywhere] break-words">
              &quot;{postTitle}&quot; 게시물을 이 그룹의 관리자에게 신고합니다. 신고자 정보는
              관리자에게 공개되지 않습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="post-report-reason">신고 사유</Label>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as GroupPostReportReason)}
            >
              <SelectTrigger id="post-report-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {POST_REPORT_REASONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="post-report-details">상세 설명 (선택)</Label>
              <span className="text-muted-foreground text-xs">{details.length}/1,000</span>
            </div>
            <Textarea
              id="post-report-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
              rows={4}
              placeholder="관리자가 확인해야 할 내용을 적어 주세요."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" variant="destructive">
              신고하기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
