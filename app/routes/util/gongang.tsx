import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useState, type Dispatch, type SetStateAction } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { Button } from "~/components/ui/button"
import { mockProfile } from "~/lib/profile/mock-data"
import { cn } from "~/lib/utils"

type PageTab = "gongang" | "karaoke"

type GongangBooking = {
  purpose: string
  applicant: string
}

type KaraokeBooking = {
  users: string
  applicant: string
}

type GongangBookingMap = Record<string, GongangBooking>
type KaraokeBookingMap = Record<string, KaraokeBooking>

type TimeSlot = {
  id: string
  label: string
}

const FLOORS = ["지하 1층", "2층", "4층", "10층"] as const

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
  const end = start + 1

  return {
    id: `hour-${start}`,
    label: `${koreanHour(start)} - ${koreanHour(end)}`,
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
  const distance = day === 0 ? -6 : 1 - day
  return addDays(date, distance)
}

function getWeekDates(weekStart: Date) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
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

function applicantName() {
  return mockProfile.cohort === null
    ? mockProfile.name
    : `${mockProfile.cohort}기 ${mockProfile.name}`
}

function gongangKey(date: Date, slotId: string, floor: string) {
  return `${dateKey(date)}:${slotId}:${floor}`
}

function karaokeKey(date: Date, slotId: string) {
  return `${dateKey(date)}:${slotId}`
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
  applicant,
  canManage,
  isMine,
  applicantDraft,
  onApplicantChange,
  onReserve,
  onCancel,
}: {
  applicant?: string
  canManage: boolean
  isMine: boolean
  applicantDraft: string
  onApplicantChange: (value: string) => void
  onReserve: () => void
  onCancel: () => void
}) {
  if (applicant) {
    return (
      <div className="flex min-w-48 items-center justify-between gap-2">
        <span className="text-primary truncate text-sm">{applicant}</span>

        {canManage || isMine ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
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
          onChange={(event) => onApplicantChange(event.target.value)}
          placeholder="신청자"
          className="border-input bg-background h-9 min-w-0 flex-1 rounded-sm border px-2 text-sm outline-none focus:ring-2"
        />

        <Button type="button" size="sm" onClick={onReserve}>
          등록
        </Button>
      </div>
    )
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onReserve}>
      신청
    </Button>
  )
}

function GongangTable({
  dates,
  canManage,
  bookings,
  setBookings,
}: {
  dates: Date[]
  canManage: boolean
  bookings: GongangBookingMap
  setBookings: Dispatch<SetStateAction<GongangBookingMap>>
}) {
  const [purposeDrafts, setPurposeDrafts] = useState<Record<string, string>>({})
  const [applicantDrafts, setApplicantDrafts] = useState<Record<string, string>>({})

  const reserve = (key: string) => {
    const purpose = purposeDrafts[key]?.trim()
    const applicant = canManage ? applicantDrafts[key]?.trim() : applicantName()

    if (!purpose) {
      toast.error("목적을 입력해 주세요.")
      return
    }

    if (!applicant) {
      toast.error("신청자를 입력해 주세요.")
      return
    }

    setBookings((current) => ({
      ...current,
      [key]: { purpose, applicant },
    }))

    setPurposeDrafts((current) => ({ ...current, [key]: "" }))
    setApplicantDrafts((current) => ({ ...current, [key]: "" }))
  }

  const cancel = (key: string) => {
    setBookings((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

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
                const key = gongangKey(date, slot.id, floor)
                const booking = bookings[key]

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

                    <td className="border-border w-28 border px-3 py-3">{floor}</td>

                    <td className="border-border border p-1">
                      {booking ? (
                        <span className="block min-w-72 px-2 py-2">{booking.purpose}</span>
                      ) : (
                        <input
                          value={purposeDrafts[key] ?? ""}
                          onChange={(event) =>
                            setPurposeDrafts((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          aria-label={`${slot.label} ${floor} 목적`}
                          className="border-input bg-background h-9 w-full min-w-72 rounded-sm border px-2 text-sm outline-none focus:ring-2"
                        />
                      )}
                    </td>

                    <td className="border-border w-64 border px-3 py-2">
                      <ApplicantCell
                        applicant={booking?.applicant}
                        canManage={canManage}
                        isMine={booking?.applicant === applicantName()}
                        applicantDraft={applicantDrafts[key] ?? ""}
                        onApplicantChange={(value) =>
                          setApplicantDrafts((current) => ({
                            ...current,
                            [key]: value,
                          }))
                        }
                        onReserve={() => reserve(key)}
                        onCancel={() => cancel(key)}
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
  canManage,
  bookings,
  setBookings,
}: {
  dates: Date[]
  canManage: boolean
  bookings: KaraokeBookingMap
  setBookings: Dispatch<SetStateAction<KaraokeBookingMap>>
}) {
  const [userDrafts, setUserDrafts] = useState<Record<string, string>>({})
  const [applicantDrafts, setApplicantDrafts] = useState<Record<string, string>>({})

  const reserve = (key: string) => {
    const users = userDrafts[key]?.trim()
    const applicant = canManage ? applicantDrafts[key]?.trim() : applicantName()

    if (!users) {
      toast.error("사용자 명단을 입력해 주세요.")
      return
    }

    if (!applicant) {
      toast.error("신청자를 입력해 주세요.")
      return
    }

    setBookings((current) => ({
      ...current,
      [key]: { users, applicant },
    }))

    setUserDrafts((current) => ({ ...current, [key]: "" }))
    setApplicantDrafts((current) => ({ ...current, [key]: "" }))
  }

  const cancel = (key: string) => {
    setBookings((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

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
              const key = karaokeKey(date, slot.id)
              const booking = bookings[key]

              return (
                <tr key={key}>
                  {index === 0 ? <DateCell date={date} rowSpan={slots.length} /> : null}

                  <td className="border-border w-48 border px-3 py-3 text-center">{slot.label}</td>

                  <td className="border-border border p-1">
                    {booking ? (
                      <span className="block min-w-[420px] px-2 py-2">{booking.users}</span>
                    ) : (
                      <input
                        value={userDrafts[key] ?? ""}
                        onChange={(event) =>
                          setUserDrafts((current) => ({
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
                      applicant={booking?.applicant}
                      canManage={canManage}
                      isMine={booking?.applicant === applicantName()}
                      applicantDraft={applicantDrafts[key] ?? ""}
                      onApplicantChange={(value) =>
                        setApplicantDrafts((current) => ({
                          ...current,
                          [key]: value,
                        }))
                      }
                      onReserve={() => reserve(key)}
                      onCancel={() => cancel(key)}
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

export default function GongangPage() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<PageTab>("gongang")
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [gongangBookings, setGongangBookings] = useState<GongangBookingMap>({})
  const [karaokeBookings, setKaraokeBookings] = useState<KaraokeBookingMap>({})

  const canManage = searchParams.get("as") === "master"
  const dates = getWeekDates(weekStart)
  const weekEnd = dates[6]

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="text-3xl font-semibold">공강</h1>

      <nav className="mt-6 flex border-b" aria-label="공강 서비스">
        {[
          { id: "gongang" as const, label: "공강" },
          { id: "karaoke" as const, label: "노래방" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-5 py-3 text-sm font-semibold",
              tab === item.id
                ? "border-foreground text-foreground"
                : "text-muted-foreground border-transparent"
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="border-border my-4 flex items-center justify-between border p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart((current) => addDays(current, -7))}
          aria-label="이전 주"
        >
          <ChevronLeftIcon aria-hidden />
        </Button>

        <p className="text-sm font-semibold">
          {shortDateFormatter.format(weekStart)} - {shortDateFormatter.format(weekEnd)}
        </p>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart((current) => addDays(current, 7))}
          aria-label="다음 주"
        >
          <ChevronRightIcon aria-hidden />
        </Button>
      </div>

      {tab === "gongang" ? (
        <GongangTable
          dates={dates}
          canManage={canManage}
          bookings={gongangBookings}
          setBookings={setGongangBookings}
        />
      ) : (
        <KaraokeTable
          dates={dates}
          canManage={canManage}
          bookings={karaokeBookings}
          setBookings={setKaraokeBookings}
        />
      )}
    </div>
  )
}
