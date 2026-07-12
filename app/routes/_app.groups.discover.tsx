import { Link } from "react-router"
import { Input } from "../components/ui/input"
import { SpaceCard } from "../components/layout/space-card"

const unjoinedUnofficialSpaces = [
  {
    name: "민사고 사진 공유",
    description: "학교 행사, 일상, 풍경 사진을 함께 올리고 공유하는 그룹입니다.",
    memberCount: "248명",
  },
  {
    name: "시험기간 생존방",
    description: "시험 공부법, 자료, 멘탈 관리 팁을 나누는 비공식 그룹입니다.",
    memberCount: "193명",
  },
  {
    name: "기숙사 생활 공유",
    description: "기숙사 생활 팁, 필요한 물건, 생활 정보를 나누는 그룹입니다.",
    memberCount: "321명",
  },
  {
    name: "급식 리뷰",
    description: "오늘 급식 후기와 메뉴 이야기를 가볍게 나누는 그룹입니다.",
    memberCount: "287명",
  },
]

export default function GroupDiscoverPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <section className="flex flex-col gap-2">
        <Link to="/groups" className="text-muted-foreground hover:text-foreground w-fit text-sm">
          ← 그룹으로 돌아가기
        </Link>

        <h1 className="text-2xl font-semibold">비공식 그룹 찾기</h1>
        <p className="text-muted-foreground text-sm">
          가입하지 않은 비공식 그룹을 검색하고 참여해요.
        </p>
      </section>

      <Input placeholder="그룹 이름으로 검색" className="max-w-sm" />

      <section className="grid gap-2 md:grid-cols-2">
        {unjoinedUnofficialSpaces.map((space) => (
          <SpaceCard key={space.name} space={space} variant="community" actionLabel="가입" />
        ))}
      </section>
    </div>
  )
}
