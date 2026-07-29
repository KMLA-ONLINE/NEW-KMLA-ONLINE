import { FlagIcon, ShieldCheckIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { Link } from "react-router"

import { RelativeTime } from "~/components/relative-time"
import { RichText } from "~/components/rich-text/rich-text"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/components/ui/empty"
import {
  formatReportCount,
  POST_REPORT_REASON_LABEL,
  POST_REPORT_REASONS,
  REPORT_CASE_PAGE_SIZE,
  REPORT_DETAIL_PAGE_SIZE,
} from "~/lib/group/reports"
import type { GroupPostReport, GroupPostReportCase } from "~/lib/group/types"
import { cn } from "~/lib/utils"

function ClampedReportDetails({ details }: { details: string }) {
  const [expanded, setExpanded] = useState(false)
  const [clampable, setClampable] = useState(false)
  const measure = useCallback((node: HTMLParagraphElement | null) => {
    if (node) setClampable(node.scrollHeight > node.clientHeight + 1)
  }, [])

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <p
        ref={measure}
        className={cn(
          "text-muted-foreground max-w-full text-sm [overflow-wrap:anywhere] break-words whitespace-pre-wrap",
          !expanded && "line-clamp-3"
        )}
      >
        {details}
      </p>
      {clampable || expanded ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "접기" : "더 보기"}
        </button>
      ) : null}
    </div>
  )
}

function ReportCaseCard({
  reportCase,
  reports,
  onLoadMoreReports,
  onDismiss,
  onRequestRemove,
}: {
  reportCase: GroupPostReportCase
  reports: GroupPostReport[]
  onLoadMoreReports: () => void
  onDismiss: () => void
  onRequestRemove: () => void
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const hasMoreReports = reports.length < reportCase.reportCount

  return (
    <Card size="sm" className="rounded-none sm:rounded-xl">
      <CardHeader>
        <CardTitle className="min-w-0 pr-2">
          <Link
            to={`posts/${reportCase.pubId}`}
            className="line-clamp-2 [overflow-wrap:anywhere] break-words hover:underline"
          >
            {reportCase.title}
          </Link>
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          <span>게시</span>
          <RelativeTime value={reportCase.postCreatedAt} />
          <span aria-hidden="true">·</span>
          <span>첫 신고</span>
          <RelativeTime value={reportCase.firstReportedAt} />
        </CardDescription>
        <CardAction>
          <Badge variant="secondary" aria-label={`신고 ${reportCase.reportCount}건`}>
            <FlagIcon aria-hidden="true" />
            <span aria-hidden="true">{formatReportCount(reportCase.reportCount)}건</span>
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col gap-4">
        <div className="bg-muted/45 min-w-0 rounded-lg p-3">
          <div className="line-clamp-3 text-sm leading-6 [overflow-wrap:anywhere] break-words">
            <RichText text={reportCase.content.replace(/\n{2,}/g, "\n")} mode="block" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="신고 사유별 집계">
          {POST_REPORT_REASONS.flatMap(([reason, label]) => {
            const count = reportCase.reasonCounts[reason] ?? 0
            return count > 0 ? (
              <Badge key={reason} variant="outline" aria-label={`${label} ${count}건`}>
                <span aria-hidden="true">
                  {label} {formatReportCount(count)}
                </span>
              </Badge>
            ) : (
              []
            )
          })}
        </div>

        {!detailsOpen ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              if (reports.length === 0) onLoadMoreReports()
              setDetailsOpen(true)
            }}
            aria-expanded="false"
          >
            신고 내용 보기
          </Button>
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <ul className="divide-border/70 flex min-w-0 flex-col divide-y">
              {reports.map((report) => (
                <li
                  key={report.id}
                  className="flex min-w-0 flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{POST_REPORT_REASON_LABEL[report.reason]}</Badge>
                    <RelativeTime
                      value={report.createdAt}
                      className="text-muted-foreground text-xs"
                    />
                  </div>
                  {report.details ? (
                    <ClampedReportDetails details={report.details} />
                  ) : (
                    <p className="text-muted-foreground text-xs">상세 설명 없음</p>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {hasMoreReports ? (
                <Button type="button" variant="outline" size="sm" onClick={onLoadMoreReports}>
                  {Math.min(REPORT_DETAIL_PAGE_SIZE, reportCase.reportCount - reports.length)}건 더
                  보기
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDetailsOpen(false)
                }}
                aria-expanded="true"
              >
                신고 내용 접기
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-wrap justify-end gap-2 border-t">
        <Button variant="outline" size="sm" onClick={onDismiss}>
          기각
        </Button>
        <Button variant="destructive" size="sm" onClick={onRequestRemove}>
          게시물 삭제
        </Button>
      </CardFooter>
    </Card>
  )
}

export function GroupPostReports({
  cases,
  caseCount,
  reportsByPostId,
  onLoadMoreCases,
  onLoadMoreReports,
  onDismiss,
  onRemove,
}: {
  cases: GroupPostReportCase[]
  caseCount: number
  reportsByPostId: Readonly<Record<number, GroupPostReport[]>>
  onLoadMoreCases: () => void
  onLoadMoreReports: (postId: number) => void
  onDismiss: (reportCase: GroupPostReportCase) => void
  onRemove: (reportCase: GroupPostReportCase) => void
}) {
  const [removeTarget, setRemoveTarget] = useState<GroupPostReportCase | null>(null)
  const hasMoreCases = cases.length < caseCount

  if (cases.length === 0) {
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldCheckIcon />
          </EmptyMedia>
          <EmptyTitle>대기 중인 신고가 없습니다</EmptyTitle>
          <EmptyDescription>새 신고가 접수되면 게시물별로 이곳에 표시됩니다.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="post-reports-heading">
      <div className="px-4 sm:px-0">
        <h2 id="post-reports-heading" className="font-semibold">
          게시물 신고
        </h2>
      </div>

      {cases.map((reportCase) => (
        <ReportCaseCard
          key={reportCase.postId}
          reportCase={reportCase}
          reports={reportsByPostId[reportCase.postId] ?? []}
          onLoadMoreReports={() => onLoadMoreReports(reportCase.postId)}
          onDismiss={() => onDismiss(reportCase)}
          onRequestRemove={() => setRemoveTarget(reportCase)}
        />
      ))}

      {hasMoreCases ? (
        <Button type="button" variant="outline" className="mx-4 sm:mx-0" onClick={onLoadMoreCases}>
          {Math.min(REPORT_CASE_PAGE_SIZE, caseCount - cases.length)}건 더 보기
        </Button>
      ) : null}

      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>신고된 게시물을 삭제할까요?</DialogTitle>
            <DialogDescription>
              게시물이 삭제되고 이 게시물에 접수된 신고 {removeTarget?.reportCount ?? 0}건이 모두
              처리됩니다. 이 mock 화면에서는 새로고침하면 초기 상태로 돌아갑니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (removeTarget) onRemove(removeTarget)
                setRemoveTarget(null)
              }}
            >
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
