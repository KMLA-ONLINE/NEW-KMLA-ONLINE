import { describe, expect, it } from "vitest"

import { formatMealDate, getKoreaDate, parseMealResponse } from "./neis"

describe("NEIS meal data", () => {
  it("uses the calendar date in Korea", () => {
    expect(getKoreaDate(new Date("2026-07-23T16:30:00Z"))).toBe("20260724")
    expect(formatMealDate("20260724")).toBe("7월 24일 (금)")
  })

  it("splits dishes, removes allergen numbers, and orders meals", () => {
    const payload = {
      mealServiceDietInfo: [
        { head: [{ list_total_count: 2 }] },
        {
          row: [
            {
              MMEAL_SC_CODE: "2",
              MMEAL_SC_NM: "중식",
              MLSV_YMD: "20260724",
              DDISH_NM: "한우불고기 (5.6.13.16)<br/>과일(선택) <br />배추김치 (9)",
            },
            {
              MMEAL_SC_CODE: "1",
              MMEAL_SC_NM: "조식",
              MLSV_YMD: "20260724",
              DDISH_NM: "백미밥 <br/>된장국 (5.6)",
            },
          ],
        },
      ],
    }

    expect(parseMealResponse(payload, "20260724")).toEqual([
      { label: "조식", items: ["백미밥", "된장국"] },
      { label: "중식", items: ["한우불고기", "과일(선택)", "배추김치"] },
    ])
  })

  it("returns no meals for an empty or unrelated response", () => {
    expect(parseMealResponse({ RESULT: { CODE: "INFO-200" } }, "20260724")).toEqual([])
    expect(
      parseMealResponse(
        {
          mealServiceDietInfo: [
            {},
            { row: [{ MLSV_YMD: "20260723", DDISH_NM: "백미밥", MMEAL_SC_CODE: "1" }] },
          ],
        },
        "20260724"
      )
    ).toEqual([])
  })
})
