import { useMemo, useState } from "react"
import { Link, useLocation, useRevalidator } from "react-router"
import { toast } from "sonner"

import { MenuSubHeader } from "~/components/menu/menu-sub-header"
import { Button } from "~/components/ui/button"
import { createClient } from "~/lib/supabase/client"
import type { Database } from "~/lib/supabase/database.types"
import { cn } from "~/lib/utils"

export const handle = {
  showMobileTabBar: false,
}

type BookingType = Database["public"]["Enums"]["utility_booking_type"]
type GongangLocation = Database["public"]["Enums"]["gongang_location"]
type AccessRow = Database["public"]["Functions"]["get_my_utility_access"]["Returns"][number]
type BookingRow = Database["public"]["Functions"]["get_current_utility_bookings"]["Returns"][number]
type CreateArgs = Database["public"]["Functions"]["create_utility_booking"]["Args"]

type LoaderData = {
  access: AccessRow
  bookings: BookingRow[]
}

type TimeSlot = {
  id: string
  label: string
}

const FLOORS: {
  id: GongangLocation
  label: string
}[] = [
  { id: "floor_b1", label: "지하 1층" },
  { id: "floor_2", label: "2층" },
  { id: "floor_4", label: "4층" },
  { id: "floor_10", label: "10층" },
]

const GONGANG_SLOTS: TimeSlot[] = [
  { id: "study-1", label: "1자습" },
  { id: "honjeong-end", label: "혼정끝" },
  { id: "study-2", label: "2자습" },
]

const WEEKDAY_KARAOKE_SLOTS: TimeSlot[] = [
  { id: "lunch", label: "점심 시간" },
  { id: "dinner", label: "저녁 시간" },
]

function koreanHour(hour: number) {
  if (hour < 12) return `오전 ${String(hour).padStart(2, "0")}시`
  if (hour === 12) return "오후 12시"
  return `오후 ${String(hour - 12).padStart(2, "0")}시`
}

const WEEKEND_KARAOKE_SLOTS: TimeSlot[] = Array.from({ length: 11 }, (_, index) => {
  const start = index + 8

  return {
    id: `hour-${start}`,
    label: `${koreanHour(start)} - ${koreanHour(start + 1)}`,
  }
})

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const shortDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "numeric",
  day: "numeric",
})

const weekdayFormatter = new Intl.DateTimeFormat("ko-KR", {
  weekday: "short",
})

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return startOfDay(next)
}

function startOfWeek(date: Date) {
  const day = date.getDay()
  return addDays(date, day === 0 ? -6 : 1 - day)
}

function getWeekDates(date: Date) {
  return Array.from({ length: 7 }, (_, index) => addDays(date, index))
}

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6
}

function bookingKey(
  type: BookingType,
  date: string,
  slot: string,
  location?: GongangLocation | null
) {
  return type === "gongang" ? `${date}:${slot}:${location}` : `${date}:${slot}`
}

export async function clientLoader(): Promise<LoaderData> {
  const supabase = createClient()

  const [accessResult, bookingsResult] = await Promise.all([
    supabase.rpc("get_my_utility_access").single(),
    supabase.rpc("get_current_utility_bookings"),
  ])

  if (accessResult.error) {
    throw new Error(`권한을 확인하지 못했습니다. (${accessResult.error.code})`, {
      cause: accessResult.error,
    })
  }

  if (bookingsResult.error) {
    throw new Error(`예약을 불러오지 못했습니다. (${bookingsResult.error.code})`, {
      cause: bookingsResult.error,
    })
  }

  const access = accessResult.data as AccessRow | null

  if (!access) {
    throw new Error("권한 정보를 불러오지 못했습니다.")
  }

  return {
    access,
    bookings: bookingsResult.data ?? [],
  }
}

function DateCell({ date, rowSpan }: { date: Date; rowSpan: number }) {
  return (
    <td rowSpan={rowSpan} className="border-border w-28 border px-3 py-4 text-center align-middle">
      <p className="text-sm whitespace-nowrap">{dateFormatter.format(date)}</p>
      <p className="mt-1 text-sm font-semibold">{weekdayFormatter.format(date).replace(".", "")}</p>
    </td>
  )
}

function ApplicantCell({
  booking,
  canManage,
  applicantDraft,
  pending,
  onApplicantChange,
  onReserve,
  onCancel,
}: {
  booking?: BookingRow
  canManage: boolean
  applicantDraft: string
  pending: boolean
  onApplicantChange: (value: string) => void
  onReserve: () => void
  onCancel: () => void
}) {
  if (booking) {
    return (
      <div className="flex min-w-48 items-center justify-between gap-2">
        <span className="text-primary truncate text-sm">{booking.owner_label}</span>

        {canManage || booking.is_mine ? (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onCancel}>
            {canManage ? "초기화" : "취소"}
          </Button>
        ) : null}
      </div>
    )
  }

  if (canManage) {
    return (
      <div className="flex min-w-56 gap-2">
        <input
          value={applicantDraft}
          disabled={pending}
          onChange={(event) => onApplicantChange(event.target.value)}
          placeholder="30기 김민족"
          className="border-input bg-background h-9 min-w-0 flex-1 rounded-sm border px-2 text-sm outline-none focus:ring-2"
        />

        <Button type="button" size="sm" disabled={pending} onClick={onReserve}>
          등록
        </Button>
      </div>
    )
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onReserve}>
      신청
    </Button>
  )
}

function GongangTable({
  dates,
  bookings,
  canManage,
  pendingKey,
  onCreate,
  onCancel,
}: {
  dates: Date[]
  bookings: Map<string, BookingRow>
  canManage: boolean
  pendingKey: string | null
  onCreate: (
    date: Date,
    slot: string,
    location: GongangLocation,
    detail: string,
    ownerLabel: string
  ) => Promise<boolean>
  onCancel: (booking: BookingRow, key: string) => Promise<void>
}) {
  const [purposes, setPurposes] = useState<Record<string, string>>({})
  const [applicants, setApplicants] = useState<Record<string, string>>({})

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="border-border border px-3 py-2 text-left">날짜</th>
            <th className="border-border border px-3 py-2 text-left">시간</th>
            <th className="border-border border px-3 py-2 text-left">층</th>
            <th className="border-border border px-3 py-2 text-left">목적</th>
            <th className="border-border border px-3 py-2 text-left">신청자</th>
          </tr>
        </thead>

        <tbody>
          {dates.flatMap((date) =>
            GONGANG_SLOTS.flatMap((slot, slotIndex) =>
              FLOORS.map((floor, floorIndex) => {
                const key = bookingKey("gongang", dateKey(date), slot.id, floor.id)
                const booking = bookings.get(key)
                const pending = pendingKey === key

                return (
                  <tr key={key}>
                    {slotIndex === 0 && floorIndex === 0 ? (
                      <DateCell date={date} rowSpan={GONGANG_SLOTS.length * FLOORS.length} />
                    ) : null}

                    {floorIndex === 0 ? (
                      <td
                        rowSpan={FLOORS.length}
                        className="border-border w-32 border px-3 py-3 text-center align-middle"
                      >
                        {slot.label}
                      </td>
                    ) : null}

                    <td className="border-border w-28 border px-3 py-3">{floor.label}</td>

                    <td className="border-border border p-1">
                      {booking ? (
                        <span className="block min-w-72 px-2 py-2">{booking.detail}</span>
                      ) : (
                        <input
                          value={purposes[key] ?? ""}
                          disabled={pending}
                          onChange={(event) =>
                            setPurposes((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          aria-label={`${slot.label} ${floor.label} 목적`}
                          className="border-input bg-background h-9 w-full min-w-72 rounded-sm border px-2 text-sm outline-none focus:ring-2"
                        />
                      )}
                    </td>

                    <td className="border-border w-64 border px-3 py-2">
                      <ApplicantCell
                        booking={booking}
                        canManage={canManage}
                        applicantDraft={applicants[key] ?? ""}
                        pending={pending}
                        onApplicantChange={(value) =>
                          setApplicants((current) => ({
                            ...current,
                            [key]: value,
                          }))
                        }
                        onReserve={async () => {
                          const purpose = purposes[key]?.trim()

                          if (!purpose) {
                            toast.error("목적을 입력해 주세요.")
                            return
                          }

                          const saved = await onCreate(
                            date,
                            slot.id,
                            floor.id,
                            purpose,
                            applicants[key]?.trim() ?? ""
                          )

                          if (saved) {
                            setPurposes((current) => ({
                              ...current,
                              [key]: "",
                            }))
                            setApplicants((current) => ({
                              ...current,
                              [key]: "",
                            }))
                          }
                        }}
                        onCancel={() => {
                          if (booking) {
                            void onCancel(booking, key)
                          }
                        }}
                      />
                    </td>
                  </tr>
                )
              })
            )
          )}
        </tbody>
      </table>
    </div>
  )
}

function KaraokeTable({
  dates,
  bookings,
  canManage,
  pendingKey,
  onCreate,
  onCancel,
}: {
  dates: Date[]
  bookings: Map<string, BookingRow>
  canManage: boolean
  pendingKey: string | null
  onCreate: (date: Date, slot: string, detail: string, ownerLabel: string) => Promise<boolean>
  onCancel: (booking: BookingRow, key: string) => Promise<void>
}) {
  const [users, setUsers] = useState<Record<string, string>>({})
  const [applicants, setApplicants] = useState<Record<string, string>>({})

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="border-border border px-3 py-2 text-left">날짜</th>
            <th className="border-border border px-3 py-2 text-left">시간</th>
            <th className="border-border border px-3 py-2 text-left">사용자 명단</th>
            <th className="border-border border px-3 py-2 text-left">신청자</th>
          </tr>
        </thead>

        <tbody>
          {dates.flatMap((date) => {
            const slots = isWeekend(date) ? WEEKEND_KARAOKE_SLOTS : WEEKDAY_KARAOKE_SLOTS

            return slots.map((slot, index) => {
              const key = bookingKey("karaoke", dateKey(date), slot.id)
              const booking = bookings.get(key)
              const pending = pendingKey === key

              return (
                <tr key={key}>
                  {index === 0 ? <DateCell date={date} rowSpan={slots.length} /> : null}

                  <td className="border-border w-48 border px-3 py-3 text-center">{slot.label}</td>

                  <td className="border-border border p-1">
                    {booking ? (
                      <span className="block min-w-[420px] px-2 py-2">{booking.detail}</span>
                    ) : (
                      <input
                        value={users[key] ?? ""}
                        disabled={pending}
                        onChange={(event) =>
                          setUsers((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        aria-label={`${slot.label} 사용자 명단`}
                        className="border-input bg-background h-9 w-full min-w-[420px] rounded-sm border px-2 text-sm outline-none focus:ring-2"
                      />
                    )}
                  </td>

                  <td className="border-border w-64 border px-3 py-2">
                    <ApplicantCell
                      booking={booking}
                      canManage={canManage}
                      applicantDraft={applicants[key] ?? ""}
                      pending={pending}
                      onApplicantChange={(value) =>
                        setApplicants((current) => ({
                          ...current,
                          [key]: value,
                        }))
                      }
                      onReserve={async () => {
                        const userList = users[key]?.trim()

                        if (!userList) {
                          toast.error("사용자 명단을 입력해 주세요.")
                          return
                        }

                        const saved = await onCreate(
                          date,
                          slot.id,
                          userList,
                          applicants[key]?.trim() ?? ""
                        )

                        if (saved) {
                          setUsers((current) => ({
                            ...current,
                            [key]: "",
                          }))
                          setApplicants((current) => ({
                            ...current,
                            [key]: "",
                          }))
                        }
                      }}
                      onCancel={() => {
                        if (booking) {
                          void onCancel(booking, key)
                        }
                      }}
                    />
                  </td>
                </tr>
              )
            })
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function UtilityBookingPage({ loaderData }: { loaderData: LoaderData }) {
  const routeLocation = useLocation()
  const revalidator = useRevalidator()
  const supabase = useMemo(() => createClient(), [])
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const tab: BookingType = routeLocation.pathname.endsWith("/karaoke") ? "karaoke" : "gongang"

  const weekStart = useMemo(() => startOfWeek(new Date()), [])
  const dates = useMemo(() => getWeekDates(weekStart), [weekStart])
  const weekEnd = dates[6]

  const bookingMap = useMemo(() => {
    const map = new Map<string, BookingRow>()

    for (const booking of loaderData.bookings) {
      map.set(
        bookingKey(booking.booking_type, booking.booking_date, booking.slot_key, booking.location),
        booking
      )
    }

    return map
  }, [loaderData.bookings])

  const canUse = tab === "gongang" ? loaderData.access.can_gongang : loaderData.access.can_karaoke

  const canManage =
    tab === "gongang" ? loaderData.access.manages_gongang : loaderData.access.manages_karaoke

  const createBooking = async (args: CreateArgs, key: string) => {
    setPendingKey(key)

    const { error } = await supabase.rpc("create_utility_booking", args)

    if (error) {
      toast.error(error.message)
      setPendingKey(null)
      return false
    }

    toast.success("신청했습니다.")
    revalidator.revalidate()
    setPendingKey(null)
    return true
  }

  const cancelBooking = async (booking: BookingRow, key: string) => {
    setPendingKey(key)

    const { error } = await supabase.rpc("cancel_utility_booking", {
      p_booking_id: booking.booking_id,
    })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success("취소했습니다.")
      revalidator.revalidate()
    }

    setPendingKey(null)
  }

  const resetBookings = async () => {
    const key = `reset-${tab}`
    setPendingKey(key)

    const { error } = await supabase.rpc("reset_current_utility_bookings", {
      p_booking_type: tab,
    })

    if (error) {
      toast.error(error.message)
    } else {
      toast.success("초기화했습니다.")
      revalidator.revalidate()
    }

    setPendingKey(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <MenuSubHeader title={tab === "gongang" ? "공강" : "노래방"} />

      <nav className="mt-6 flex border-b" aria-label="공강 서비스">
        {[
          {
            id: "gongang" as const,
            label: "공강",
            to: "/util/gongang",
          },
          {
            id: "karaoke" as const,
            label: "노래방",
            to: "/util/karaoke",
          },
        ].map((item) => (
          <Link
            key={item.id}
            to={item.to}
            className={cn(
              "-mb-px border-b-2 px-5 py-3 text-sm font-semibold",
              tab === item.id
                ? "border-foreground text-foreground"
                : "text-muted-foreground border-transparent"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-border my-4 grid grid-cols-[1fr_auto_1fr] items-center border p-2">
        <span />

        <p className="text-sm font-semibold">
          {shortDateFormatter.format(weekStart)}
          {" - "}
          {shortDateFormatter.format(weekEnd)}
        </p>

        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-end"
            disabled={pendingKey === `reset-${tab}`}
            onClick={() => {
              void resetBookings()
            }}
          >
            초기화
          </Button>
        ) : (
          <span />
        )}
      </div>

      {!canUse ? (
        <p className="text-muted-foreground py-16 text-center text-sm">권한이 없습니다.</p>
      ) : tab === "gongang" ? (
        <GongangTable
          dates={dates}
          bookings={bookingMap}
          canManage={canManage}
          pendingKey={pendingKey}
          onCreate={(date, slot, location, detail, ownerLabel) =>
            createBooking(
              {
                p_booking_type: "gongang",
                p_booking_date: dateKey(date),
                p_slot_key: slot,
                p_detail: detail,
                p_location: location,
                ...(ownerLabel
                  ? {
                      p_owner_label: ownerLabel,
                    }
                  : {}),
              },
              bookingKey("gongang", dateKey(date), slot, location)
            )
          }
          onCancel={cancelBooking}
        />
      ) : (
        <KaraokeTable
          dates={dates}
          bookings={bookingMap}
          canManage={canManage}
          pendingKey={pendingKey}
          onCreate={(date, slot, detail, ownerLabel) =>
            createBooking(
              {
                p_booking_type: "karaoke",
                p_booking_date: dateKey(date),
                p_slot_key: slot,
                p_detail: detail,
                ...(ownerLabel
                  ? {
                      p_owner_label: ownerLabel,
                    }
                  : {}),
              },
              bookingKey("karaoke", dateKey(date), slot)
            )
          }
          onCancel={cancelBooking}
        />
      )}
    </div>
  )
}
