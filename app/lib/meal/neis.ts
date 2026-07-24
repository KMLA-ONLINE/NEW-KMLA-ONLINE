const NEIS_MEAL_URL = "https://open.neis.go.kr/hub/mealServiceDietInfo"
const EDUCATION_OFFICE_CODE = "K10"
const SCHOOL_CODE = "7801132"

let cachedMealPlan: { date: string; promise: Promise<MealPlan> } | undefined

export type MealMenu = {
  label: string
  items: string[]
}

export type MealPlan = {
  date: string
  dateLabel: string
  meals: MealMenu[]
  unavailable: boolean
}

type NeisMealRow = {
  MMEAL_SC_CODE?: unknown
  MMEAL_SC_NM?: unknown
  MLSV_YMD?: unknown
  DDISH_NM?: unknown
}

const MEAL_LABELS: Record<string, string> = {
  "1": "조식",
  "2": "중식",
  "3": "석식",
}

export function getKoreaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""

  return `${read("year")}${read("month")}${read("day")}`
}

export function formatMealDate(date: string) {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(4, 6))
  const day = Number(date.slice(6, 8))
  const weekday = new Intl.DateTimeFormat("ko", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(Date.UTC(year, month - 1, day)))

  return `${month}월 ${day}일 (${weekday})`
}

export function parseMealResponse(payload: unknown, date: string): MealMenu[] {
  if (!payload || typeof payload !== "object" || !("mealServiceDietInfo" in payload)) return []

  const sections = (payload as { mealServiceDietInfo?: unknown }).mealServiceDietInfo
  if (!Array.isArray(sections)) return []

  const rows = sections.find((section): section is { row: NeisMealRow[] } =>
    Boolean(
      section && typeof section === "object" && "row" in section && Array.isArray(section.row)
    )
  )?.row
  if (!rows) return []

  return rows
    .filter(
      (row) =>
        typeof row.MLSV_YMD === "string" &&
        row.MLSV_YMD === date &&
        typeof row.DDISH_NM === "string"
    )
    .map((row) => {
      const code = typeof row.MMEAL_SC_CODE === "string" ? row.MMEAL_SC_CODE : ""
      const apiLabel = typeof row.MMEAL_SC_NM === "string" ? row.MMEAL_SC_NM : "급식"
      const dishes = row.DDISH_NM as string

      return {
        code,
        label: MEAL_LABELS[code] ?? apiLabel,
        items: dishes
          .split(/<br\s*\/?>/i)
          .map((item) => item.replace(/\s*\([0-9.]+\)\s*$/, "").trim())
          .filter(Boolean),
      }
    })
    .sort((a, b) => Number(a.code) - Number(b.code))
    .map(({ label, items }) => ({ label, items }))
}

export function getTodayMealPlan(): Promise<MealPlan> {
  const date = getKoreaDate()
  if (cachedMealPlan?.date === date) return cachedMealPlan.promise

  const promise = fetchMealPlan(date)
  cachedMealPlan = { date, promise }
  return promise
}

async function fetchMealPlan(date: string): Promise<MealPlan> {
  const dateLabel = formatMealDate(date)
  const params = new URLSearchParams({
    Type: "json",
    ATPT_OFCDC_SC_CODE: EDUCATION_OFFICE_CODE,
    SD_SCHUL_CODE: SCHOOL_CODE,
    MLSV_YMD: date,
  })

  try {
    const response = await fetch(`${NEIS_MEAL_URL}?${params}`)
    if (!response.ok) throw new Error(`NEIS request failed with ${response.status}`)

    return {
      date,
      dateLabel,
      meals: parseMealResponse(await response.json(), date),
      unavailable: false,
    }
  } catch {
    return { date, dateLabel, meals: [], unavailable: true }
  }
}
