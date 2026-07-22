import { ChevronLeftIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import { Link, Navigate, useSearchParams } from "react-router"

import { SpaceDiscoverCard } from "~/components/space/space-discover-card"
import { Checkbox } from "~/components/ui/checkbox"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { useDebouncedValue } from "~/hooks/use-debounced-value"
import { normalizeSearch } from "~/lib/group/format"
import { mockSpaces } from "~/lib/space/mock-data"

export default function GroupDiscoverPage() {
  const [searchParams] = useSearchParams()
  const [spaces, setSpaces] = useState(mockSpaces)
  const [query, setQuery] = useState("")
  // 이 화면의 이름이 "찾기"다 -- 기본은 아직 안 들어간 그룹만 보여준다. 끄면 내 그룹까지 훑는다.
  const [hideJoined, setHideJoined] = useState(true)

  // /groups의 것과 같은 규칙 -- join_space가 정책에 따라 'joined' 또는 'requested'를 돌려준다.
  const join = (pubId: string) =>
    setSpaces((current) =>
      current.map((space) => {
        if (space.pubId !== pubId) return space
        if (space.joinPolicy === "request") return { ...space, hasPendingRequest: true }
        return { ...space, isMember: true, memberCount: space.memberCount + 1 }
      })
    )

  // 타이핑이 멎은 뒤에만 거른다. 지금은 메모리의 배열이라 아끼는 게 없지만, 로더가 붙으면 한 글자가
  // 곧 쿼리 한 번이 된다(그리고 spaces.name엔 trgm 인덱스가 없다 -- 그건 posts에만 있다).
  // 이름 검색이라 멤버 목록과 같은 300ms. 입력값은 즉시 반영되므로 타이핑 자체는 그대로 즉각적이다.
  //
  // 공백은 무시한다 -- DB가 검색어를 정규화하는 규칙과 같은 함수를 쓴다(private.normalize_search).
  //
  // TODO(backend): spaces를 name으로 필터한다. 검색어를 URL(?q=)에 두면 로더가 읽고, 공유·뒤로가기도
  // 따라온다. 응답이 뒤집히는 문제(짧은 질의가 늦게 도착)는 fetcher 하나로 부르면 RR이 앞선 요청을
  // 밀어내므로 따로 손댈 게 없다.
  //
  // invite_only는 여기 애초에 못 온다 -- spaces_select가 비멤버에게 그 존재를 숨긴다.
  const settled = useDebouncedValue(query.trim(), 300)
  const needle = normalizeSearch(settled)
  const matching = spaces
    .filter((space) => space.type === "community")
    .filter((space) => needle === "" || normalizeSearch(space.name).includes(needle))
    .sort((first, second) => second.memberCount - first.memberCount)

  const results = hideJoined ? matching.filter((space) => !space.isMember) : matching
  // 필터가 **검색에 걸린 것**을 숨기고 있으면 그 사실을 말해줘야 한다. 안 그러면 이미 가입한
  // 그룹을 검색한 사람이 0건을 보고 "그런 그룹 없나 보다" 하고 만다.
  const hiddenMatches = matching.length - results.length

  if (searchParams.get("as") === "teacher") {
    return <Navigate to="/groups?as=teacher" replace />
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link
          to="/groups"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          그룹
        </Link>
        <h1 className="text-2xl font-semibold">비공식 그룹 찾기</h1>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="그룹 이름으로 검색"
            aria-label="그룹 이름으로 검색"
            className="pl-8"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Checkbox
            id="hide-joined"
            checked={hideJoined}
            onCheckedChange={(checked) => setHideJoined(checked === true)}
          />
          <Label htmlFor="hide-joined" className="text-muted-foreground text-sm font-normal">
            가입한 그룹 숨기기
          </Label>
        </div>
      </div>

      {results.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((space) => (
            <SpaceDiscoverCard key={space.pubId} space={space} onJoin={() => join(space.pubId)} />
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground bg-card flex flex-col items-center gap-2 rounded-xl border px-4 py-10 text-center text-sm">
          {/* 결과와 같은(가라앉은) 검색어를 쓴다 -- 방금 친 글자를 쓰면 아직 그 결과가 아닌데
              "'코딩'과 맞는 그룹이 없습니다"라고 말하게 된다. */}
          <p>
            {settled ? `“${settled}”와 맞는 그룹이 없습니다.` : "표시할 비공식 그룹이 없습니다."}
          </p>
          {hiddenMatches > 0 ? (
            <p>
              가입한 그룹 {hiddenMatches}개가 필터에 가려져 있습니다.{" "}
              <button
                type="button"
                onClick={() => setHideJoined(false)}
                className="text-foreground underline underline-offset-2"
              >
                모두 보기
              </button>
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
