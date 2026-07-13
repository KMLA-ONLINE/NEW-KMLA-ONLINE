import { MoreHorizontalIcon, SmilePlusIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { GroupAuthorAvatar } from "~/components/group/group-author-avatar"
import { GroupCommentComposer } from "~/components/group/group-comment-composer"
import { GroupEditedMark } from "~/components/group/group-edited-mark"
import { QuickReactionList } from "~/components/quick-reaction-list"
import { RelativeTime } from "~/components/relative-time"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { Twemoji } from "~/components/ui/twemoji"
import type { GroupComment } from "~/lib/group/types"
import { getReactionGlyph, type ReactionType } from "~/lib/reactions"
import { cn } from "~/lib/utils"

// 평면 댓글 목록을 parentId로 스레드화해 렌더한다. 대댓글은 부모 아래로 들여쓰며,
// 임의 깊이를 재귀로 처리한다(comments.parent_id).
export function GroupCommentList({
  comments,
  reactionTypes,
  canManage,
}: {
  comments: GroupComment[]
  reactionTypes: ReactionType[]
  /** owner/admin이면 남의 댓글도 삭제할 수 있다(soft_delete_comment). 수정은 작성자 본인만. */
  canManage?: boolean
}) {
  const [highlightedId, setHighlightedId] = useState<number | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 부모 -> 자식 인덱스를 한 번만 만든다. 댓글마다 전체 배열을 filter하면 O(n²)이 된다.
  // 서버(get_post_comments)는 루트 스레드 단위로 페이지를 잘라 내려주므로 n은 한 페이지 크기다.
  // TODO(backend): 로더가 붙으면 "더 보기"로 다음 루트 페이지를 이어 붙인다(커서 = 마지막 루트 id).
  const { roots, childrenOf } = useMemo(() => {
    const byParent = new Map<number, GroupComment[]>()
    const topLevel: GroupComment[] = []
    for (const comment of comments) {
      if (comment.parentId === null) {
        topLevel.push(comment)
        continue
      }
      const siblings = byParent.get(comment.parentId)
      if (siblings) siblings.push(comment)
      else byParent.set(comment.parentId, [comment])
    }
    return { roots: topLevel, childrenOf: byParent }
  }, [comments])

  // @부모이름 칩과 스크롤이 부모 댓글을 id로 찾는다. 같은 이유로 맵으로 한 번만.
  const byId = useMemo(() => new Map(comments.map((comment) => [comment.id, comment])), [comments])

  // @이름 클릭 시 부모 댓글로 스크롤하고 잠깐 강조한다. 타이머는 언마운트/재호출 시 정리.
  const navigateToComment = (id: number) => {
    setHighlightedId(id)
    document
      .getElementById(`comment-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" })
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(
      () => setHighlightedId((current) => (current === id ? null : current)),
      1600
    )
  }

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    },
    []
  )

  return (
    <ul className="flex flex-col gap-3">
      {roots.map((comment) => (
        <GroupCommentItem
          key={comment.id}
          comment={comment}
          childrenOf={childrenOf}
          byId={byId}
          reactionTypes={reactionTypes}
          highlightedId={highlightedId}
          onNavigate={navigateToComment}
          canManage={canManage}
        />
      ))}
    </ul>
  )
}

function GroupCommentItem({
  comment,
  childrenOf,
  byId,
  reactionTypes,
  highlightedId,
  onNavigate,
  canManage,
  depth = 0,
}: {
  comment: GroupComment
  /** 부모 id -> 자식들. 목록에서 한 번만 만들어 내려온다(댓글마다 filter하면 O(n^2)). */
  childrenOf: Map<number, GroupComment[]>
  /** id -> 댓글. @부모이름 칩이 부모를 찾는 데 쓴다. */
  byId: Map<number, GroupComment>
  reactionTypes: ReactionType[]
  highlightedId: number | null
  onNavigate: (id: number) => void
  canManage?: boolean
  depth?: number
}) {
  // 익명이면 서버가 매긴 라벨을 쓴다("익명1", "익명2", 익명 글의 글쓴이면 "글쓴이"). 클라이언트가
  // 번호를 매기려면 작성자별 키가 필요한데 그게 곧 author_id고, 그러면 익명이 깨진다.
  const displayName = (item: GroupComment) => item.author?.name ?? item.anonymousLabel ?? "익명"

  const name = displayName(comment)
  const replies = childrenOf.get(comment.id) ?? []
  // 답글이면 부모 댓글 작성자를 본문 앞 @이름 칩으로 붙인다(평탄화돼도 누구 답글인지 보이게).
  // 부모가 삭제된 tombstone이면 붙일 이름이 없다 -- 서버가 작성자를 지워서 내려주기 때문이다.
  const parent = comment.parentId !== null ? byId.get(comment.parentId) : null
  const parentName = parent && !parent.isDeleted ? displayName(parent) : null
  const [reaction, setReaction] = useState<ReactionType | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [replying, setReplying] = useState(false)

  // 삭제된 댓글은 답글이 살아 있는 동안만 자리를 지킨다(없애면 답글 사슬이 끊긴다). 본문·작성자·
  // 반응·답글·메뉴는 전부 사라지고 자국만 남지만, 자식 답글은 그대로 이어서 렌더한다.
  if (comment.isDeleted) {
    return (
      <li>
        <div className="flex gap-2">
          <div className="bg-muted/60 size-8 shrink-0 rounded-full" aria-hidden="true" />
          <p
            id={`comment-${comment.id}`}
            className={cn(
              "text-muted-foreground bg-muted/60 w-fit rounded-2xl px-3 py-2 text-sm italic transition-shadow",
              highlightedId === comment.id && "ring-2 ring-blue-400"
            )}
          >
            삭제된 댓글입니다
          </p>
        </div>
        {replies.length > 0 ? (
          <ul className={cn("mt-3 flex flex-col gap-3", depth === 0 && "pl-10")}>
            {replies.map((reply) => (
              <GroupCommentItem
                key={reply.id}
                comment={reply}
                childrenOf={childrenOf}
                byId={byId}
                reactionTypes={reactionTypes}
                highlightedId={highlightedId}
                onNavigate={onNavigate}
                canManage={canManage}
                depth={depth + 1}
              />
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <li>
      <div className="flex gap-2">
        <GroupAuthorAvatar name={name} anonymous={comment.author === null} />
        <div className="flex min-w-0 flex-1 items-start gap-1">
          <div className="min-w-0">
            <div
              id={`comment-${comment.id}`}
              className={cn(
                "bg-muted w-fit rounded-2xl px-3 py-2 transition-shadow",
                highlightedId === comment.id && "ring-2 ring-blue-400"
              )}
            >
              <p className="text-xs font-semibold">{name}</p>
              <p className="text-sm">
                {parentName ? (
                  <button
                    type="button"
                    className="mr-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                    onClick={() => comment.parentId !== null && onNavigate(comment.parentId)}
                  >
                    @{parentName}
                  </button>
                ) : null}
                <Twemoji text={comment.content ?? ""} />
              </p>
            </div>
            <div className="text-muted-foreground mt-1 ml-3 flex items-center gap-3 text-xs">
              {/* 반응: 클릭하면 위로 quick reaction 피커, 이미 눌렀으면 클릭으로 해제 */}
              <div className="relative">
                {pickerOpen ? (
                  <>
                    <button
                      type="button"
                      aria-label="반응 선택 닫기"
                      className="fixed inset-0 z-40 cursor-default"
                      onClick={() => setPickerOpen(false)}
                    />
                    <div className="bg-popover absolute bottom-full left-0 z-50 mb-1 rounded-full border p-1 shadow-md">
                      <QuickReactionList
                        reactionTypes={reactionTypes}
                        onSelect={(picked) => {
                          setReaction(picked)
                          setPickerOpen(false)
                        }}
                      />
                    </div>
                  </>
                ) : null}
                <button
                  type="button"
                  aria-label="반응"
                  className="hover:text-foreground flex items-center"
                  onClick={() => (reaction ? setReaction(null) : setPickerOpen(true))}
                >
                  {reaction ? (
                    <Twemoji text={getReactionGlyph(reaction)} className="text-sm leading-none" />
                  ) : (
                    <SmilePlusIcon className="size-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <button
                type="button"
                className="font-medium hover:underline"
                onClick={() => setReplying((value) => !value)}
              >
                답글
              </button>
              {/* 삭제된 댓글은 위에서 조기 반환하므로 여기까지 오지 않는다 -- tombstone에
                  "수정됨"이 붙는 일은 없다. */}
              <span className="flex items-center gap-1">
                <RelativeTime value={comment.createdAt} />
                <GroupEditedMark at={comment.updatedAt} />
              </span>
            </div>
          </div>

          {/* 수정은 작성자 본인만이다 -- comments_update 정책이 author_id=current_profile_id()라
              관리자도 남의 댓글 본문은 못 고친다. 삭제만 모더레이션 대상(soft_delete_comment). */}
          {comment.isMine || canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground ml-auto shrink-0"
                  aria-label="댓글 옵션"
                >
                  <MoreHorizontalIcon className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* TODO(backend): 수정은 comments.content를 직접 update(컬럼 grant + 작성자 RLS로 이미
                    열려 있다). 삭제는 soft_delete_comment(id) RPC -- 본문을 비워 tombstone이 원문을
                    흘리지 않게 한다. */}
                {comment.isMine ? <DropdownMenuItem>수정</DropdownMenuItem> : null}
                <DropdownMenuItem variant="destructive">삭제</DropdownMenuItem>

                {/* 익명 댓글에만. 관리자는 작성자가 누구인지 끝내 모르고 익명 권한만 뺏는다. */}
                {canManage && comment.anonymousLabel ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                      작성자는 익명으로 남습니다
                    </DropdownMenuLabel>
                    {/* TODO(backend): suspend_comment_author_anonymity(id) / 
                        undo_comment_anonymity_suspension(id). 후자는 void다 -- 자세한 이유는
                        group-post-menu.tsx의 같은 항목 주석 참고. */}
                    <DropdownMenuItem>익명 작성 제한</DropdownMenuItem>
                    <DropdownMenuItem>익명 제한 취소</DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {replies.length > 0 || replying ? (
        <ul className={cn("mt-3 flex flex-col gap-3", depth === 0 && "pl-10")}>
          {replies.map((reply) => (
            <GroupCommentItem
              key={reply.id}
              comment={reply}
              childrenOf={childrenOf}
              byId={byId}
              reactionTypes={reactionTypes}
              highlightedId={highlightedId}
              onNavigate={onNavigate}
              canManage={canManage}
              depth={depth + 1}
            />
          ))}
          {replying ? (
            <li>
              <GroupCommentComposer
                autoFocus
                className=""
                placeholder={`${name}님에게 답글 남기기…`}
                onSubmit={() => setReplying(false)}
              />
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  )
}
