import { ChevronLeftIcon, SearchIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router"

import { SpaceDiscoverCard } from "~/components/space/space-discover-card"
import { Input } from "~/components/ui/input"
import { normalizeSearch } from "~/lib/group/format"
import { mockSpaces } from "~/lib/space/mock-data"

export default function GroupDiscoverPage() {
  const [spaces, setSpaces] = useState(mockSpaces)
  const [query, setQuery] = useState("")

  // /groups의 것과 같은 규칙 -- join_space가 정책에 따라 'joined' 또는 'requested'를 돌려준다.
  const join = (pubId: string) =>
    setSpaces((current) =>
      current.map((space) => {
        if (space.pubId !== pubId) return space
        if (space.joinPolicy === "request") return { ...space, hasPendingRequest: true }
        return { ...space, isMember: true, memberCount: space.memberCount + 1 }
      })
    )

  // 공백을 무시하고 찾는다. DB가 검색어를 정규화하는 규칙과 같은 함수를 쓴다(private.normalize_search).
  //
  // TODO(backend): spaces를 name으로 필터한다. trgm 인덱스는 posts에만 있지만 space는 수가 적어
  // 그냥 훑어도 된다 -- 느려지면 그때 인덱스를 붙인다.
  //
  // 이미 가입한 그룹도 결과에 남긴다. 검색은 "내가 볼 수 있는 것"을 다 찾아줘야 하고, 카드가
  // 알아서 "열기"로 바뀐다. invite_only는 여기 애초에 못 온다 -- spaces_select가 비멤버에게 숨긴다.
  const normalized = normalizeSearch(query)
  const results = spaces
    .filter((space) => space.type === "community")
    .filter((space) => normalized === "" || normalizeSearch(space.name).includes(normalized))
    .sort((first, second) => second.memberCount - first.memberCount)

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

      <div className="relative max-w-sm">
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

      {results.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((space) => (
            <SpaceDiscoverCard key={space.pubId} space={space} onJoin={() => join(space.pubId)} />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground bg-card rounded-xl border px-4 py-10 text-center text-sm">
          “{query}”와 맞는 그룹이 없습니다.
        </p>
      )}
    </div>
  )
}
