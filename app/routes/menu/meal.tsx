import { MenuSubHeader } from "~/components/menu/menu-sub-header"
import { mockMealPlan } from "~/lib/feed/mock-data"

// 홈 피드의 급식 카드는 lg 미만에서 숨는다. 좁은 화면에서 급식을 보는 통로는 여기다.
export default function MealPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <MenuSubHeader
        title="오늘의 급식"
        aside={<span className="text-muted-foreground text-sm">{mockMealPlan.dateLabel}</span>}
      />
      <ul className="flex flex-col gap-3">
        {mockMealPlan.meals.map((meal) => (
          <li key={meal.label} className="bg-card flex flex-col gap-1.5 rounded-xl border p-4">
            <p className="text-sm font-semibold">{meal.label}</p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {meal.items.join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">매일 자동으로 업데이트됩니다.</p>
    </div>
  )
}
