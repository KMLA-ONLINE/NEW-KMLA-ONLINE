import { Suspense, use } from "react"

import { MenuSubHeader } from "~/components/menu/menu-sub-header"
import { getTodayMealPlan } from "~/lib/meal/neis"

// 홈 피드의 급식 카드는 lg 미만에서 숨는다. 좁은 화면에서 급식을 보는 통로는 여기다.
export default function MealPage() {
  return (
    <Suspense fallback={<MealPageLoading />}>
      <MealPageContent />
    </Suspense>
  )
}

function MealPageContent() {
  const mealPlan = use(getTodayMealPlan())

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <MenuSubHeader
        title="오늘의 급식"
        aside={<span className="text-muted-foreground text-sm">{mealPlan.dateLabel}</span>}
      />
      {mealPlan.meals.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {mealPlan.meals.map((meal) => (
            <li key={meal.label} className="bg-card flex flex-col gap-1.5 rounded-xl border p-4">
              <p className="text-sm font-semibold">{meal.label}</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {meal.items.join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground bg-card rounded-xl border px-4 py-8 text-center text-sm">
          {mealPlan.unavailable
            ? "급식 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."
            : "오늘은 등록된 급식이 없습니다."}
        </p>
      )}
    </div>
  )
}

function MealPageLoading() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <MenuSubHeader title="오늘의 급식" />
      <p className="text-muted-foreground bg-card rounded-xl border px-4 py-8 text-center text-sm">
        급식 정보를 불러오는 중입니다.
      </p>
    </div>
  )
}
