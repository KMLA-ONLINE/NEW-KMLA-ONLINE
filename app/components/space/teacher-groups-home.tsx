import { CirclePlusIcon } from "lucide-react"
import { Link } from "react-router"

import { SpaceRow } from "~/components/space/space-row"
import { Button } from "~/components/ui/button"
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "~/components/ui/empty"
import type { SpaceSummary } from "~/lib/space/types"

type TeacherGroupsHomeProps = {
  spaces: SpaceSummary[]
  onTogglePin: (pubId: string) => void
}

export function TeacherGroupsHome({ spaces, onTogglePin }: TeacherGroupsHomeProps) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-semibold">그룹</h1>
        <Button asChild className="w-full sm:w-auto">
          <Link to="/groups/create?as=teacher">
            <CirclePlusIcon data-icon="inline-start" aria-hidden="true" />
            비공식 그룹 만들기
          </Link>
        </Button>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="teacher-groups-heading">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="teacher-groups-heading" className="text-sm font-semibold">
            내 그룹 <span className="text-muted-foreground font-normal">{spaces.length}</span>
          </h2>
        </div>

        {spaces.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {spaces.map((space) => (
              <SpaceRow
                key={space.pubId}
                space={space}
                onTogglePin={() => onTogglePin(space.pubId)}
              />
            ))}
          </ul>
        ) : (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyTitle>아직 내 그룹이 없습니다</EmptyTitle>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link to="/groups/create?as=teacher">
                  <CirclePlusIcon data-icon="inline-start" aria-hidden="true" />
                  비공식 그룹 만들기
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </section>
    </div>
  )
}
