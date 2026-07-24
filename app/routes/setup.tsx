import { useEffect, useState, type ChangeEvent } from "react"
import { useFetcher, useLoaderData, useNavigate } from "react-router"
import { Camera, ChevronLeft, Loader2, Upload } from "lucide-react"

import type { Route } from "./+types/setup"
import type { Database } from "~/lib/supabase/database.types"
import { ProfileAvatar } from "~/components/profile/profile-avatar"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

type ProfileType = Database["public"]["Enums"]["profile_type"]
type ProfileTrack = Database["public"]["Enums"]["profile_track"]

export function clientLoader() {
  // 온보딩 마지막 단계의 OTP를 이 이메일로 보낸다 -- 가입 때 쓴 것이고, 사용자가 다시 입력하지 않는다.
  // 아직 목이다. 백엔드를 붙일 때 브라우저 세션에서 읽어 온다.
  return { email: "user@kmla" as string | null }
}

/**
 * SPA라 서버 action이 없다. 이건 백엔드 없이 도는 목이다 -- OTP 발송·검증·온보딩 저장(RPC)은
 * 백엔드를 붙일 때 여기서 브라우저 Supabase 클라이언트로 한다. 컴포넌트가 기대하는 응답 모양
 * (`otpSent`/`success`/`error`)만 그대로 흉내 낸다.
 */
export async function clientAction({ request }: Route.ClientActionArgs) {
  const formData = await request.formData()

  const readText = (field: string) => {
    const value = formData.get(field)
    const text = typeof value === "string" ? value.trim() : ""
    return text === "" ? null : text
  }

  const intent = readText("intent")

  if (intent === "send-otp") {
    return { otpSent: true as const, email: "user@kmla" }
  }

  // intent === "verify": 목이라 6자리 코드면 무엇이든 통과시킨다.
  const token = readText("otp")
  if (!token) {
    return { error: "인증 코드를 입력해 주세요." }
  }

  const name = readText("name")
  const profileType = readText("type") as ProfileType | null
  const gender = readText("gender")
  const needsGender = profileType !== "teacher"

  if (!name || !profileType || (needsGender && !gender)) {
    return {
      error: needsGender
        ? "이름, 구분, 성별을 모두 입력해 주세요."
        : "이름과 구분을 입력해 주세요.",
    }
  }

  return { success: true as const, name }
}

type SetupFormData = {
  name: string
  type: ProfileType | ""
  gender: string
  track: ProfileTrack | ""
  studentNumber: string
  cohort: string
  classNo: string
  birthYear: string
  birthMonth: string
  birthDay: string
  phoneNumber: string
  dormRoom: string
}

const initialFormData: SetupFormData = {
  name: "",
  type: "",
  gender: "",
  track: "",
  studentNumber: "",
  cohort: "",
  classNo: "",
  birthYear: "",
  birthMonth: "",
  birthDay: "",
  phoneNumber: "",
  dormRoom: "",
}

/** `submit_onboarding` takes a `date`, and Postgres wants it zero-padded. */
function toIsoDate(year: string, month: string, day: string) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-label="필수">
      *
    </span>
  )
}

function OptionalText({ recommended = false }: { recommended?: boolean }) {
  return (
    <span className="text-muted-foreground text-xs font-normal">
      ({recommended ? "매우 권장" : "선택"})
    </span>
  )
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function isValidBirthday(year: string, month: string, day: string) {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) {
    return false
  }

  const yearNumber = Number(year)
  const monthNumber = Number(month)
  const dayNumber = Number(day)

  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1) {
    return false
  }

  return dayNumber <= daysInMonth(yearNumber, monthNumber)
}

function BirthdayFields({
  required,
  year,
  month,
  day,
  onChange,
}: {
  required: boolean
  year: string
  month: string
  day: string
  onChange: (field: "birthYear" | "birthMonth" | "birthDay", value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>생년월일 {required ? <RequiredMark /> : <OptionalText />}</Label>
      <div className="grid grid-cols-3 gap-2">
        <Input
          aria-label="출생 연도"
          inputMode="numeric"
          placeholder="년"
          value={year}
          onChange={(event) =>
            onChange("birthYear", event.target.value.replace(/\D/g, "").slice(0, 4))
          }
          required={required}
          spellCheck={false}
        />
        <Input
          aria-label="출생 월"
          inputMode="numeric"
          placeholder="월"
          value={month}
          onChange={(event) =>
            onChange("birthMonth", event.target.value.replace(/\D/g, "").slice(0, 2))
          }
          required={required}
          spellCheck={false}
        />
        <Input
          aria-label="출생 일"
          inputMode="numeric"
          placeholder="일"
          value={day}
          onChange={(event) =>
            onChange("birthDay", event.target.value.replace(/\D/g, "").slice(0, 2))
          }
          required={required}
          spellCheck={false}
        />
      </div>
    </div>
  )
}

export default function Setup() {
  const navigate = useNavigate()
  const fetcher = useFetcher<typeof clientAction>()
  const { email } = useLoaderData<typeof clientLoader>()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<SetupFormData>(initialFormData)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState("")
  const [otp, setOtp] = useState("")
  const [otpSent, setOtpSent] = useState(false)

  const isStudent = formData.type === "student"
  const isAlumni = formData.type === "alumni"
  const isTeacher = formData.type === "teacher"
  const needsGender = !isTeacher
  const needsCohort = isStudent || isAlumni

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  useEffect(() => {
    if (fetcher.data && "success" in fetcher.data) {
      navigate("/pending", { state: { name: fetcher.data.name } })
    }
  }, [fetcher.data, navigate])

  const updateField = <Field extends keyof SetupFormData>(
    field: Field,
    value: SetupFormData[Field]
  ) => {
    setFormData((previous) => ({ ...previous, [field]: value }))
  }

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setAvatarFile(file)
    setAvatarPreview(file ? URL.createObjectURL(file) : "")
  }

  const canProceedFromProfile = Boolean(
    formData.name.trim() && formData.type && (!needsGender || formData.gender)
  )
  const hasValidPhoneNumber = !formData.phoneNumber || /^\d{10,11}$/.test(formData.phoneNumber)
  const hasBirthdayInput = Boolean(formData.birthYear || formData.birthMonth || formData.birthDay)
  const hasValidBirthday = isValidBirthday(
    formData.birthYear,
    formData.birthMonth,
    formData.birthDay
  )
  // 계열은 재학생·졸업생 모두의 학적 정보다. 부서·반·방만 재학생 전용이다.
  const needsTrack = isStudent || isAlumni
  const canProceedFromDetails =
    (!needsTrack || Boolean(formData.track)) &&
    (!isStudent ||
      Boolean(
        /^\d{6}$/.test(formData.studentNumber) &&
        /^\d{2}$/.test(formData.cohort) &&
        hasValidBirthday &&
        hasValidPhoneNumber
      )) &&
    (!isAlumni || (/^\d{2}$/.test(formData.cohort) && (!hasBirthdayInput || hasValidBirthday))) &&
    (!isTeacher || hasValidPhoneNumber)

  const fieldErrors = {
    studentNumber:
      formData.studentNumber && !/^\d{6}$/.test(formData.studentNumber)
        ? "학번은 6자리 숫자여야 합니다."
        : "",
    cohort:
      formData.cohort && !/^\d{2}$/.test(formData.cohort) ? "기수는 2자리 숫자여야 합니다." : "",
    phoneNumber:
      formData.phoneNumber && !/^\d{10,11}$/.test(formData.phoneNumber)
        ? "전화번호는 10~11자리 숫자여야 합니다."
        : "",
    birthday: hasBirthdayInput && !hasValidBirthday ? "올바른 생년월일을 입력하세요." : "",
  }

  const submitError = fetcher.data && "error" in fetcher.data ? fetcher.data.error : null
  const isSubmitting = fetcher.state !== "idle"

  // 코드 입력 폼으로 즉시 전환한다(낙관적). 발송이 실패하면 그 자리에 에러가 뜨고, 재전송으로
  // 다시 시도한다 -- fetcher.data를 효과로 상태에 동기화하면 렌더 중 setState가 되어 피한다.
  const sendOtp = () => {
    setOtpSent(true)
    fetcher.submit({ intent: "send-otp" }, { method: "post" })
  }

  // 코드 확인과 프로필 제출을 한 번에 보낸다 -- 서버가 코드를 먼저 확인하고, 통과할 때만 제출한다.
  // 타입이 안 쓰는 필드는 빈 값으로 보내고, action이 그걸 컬럼이 기대하는 null로 바꾼다.
  const submitVerify = () => {
    fetcher.submit(
      {
        intent: "verify",
        otp,
        name: formData.name.trim(),
        type: formData.type,
        gender: needsGender ? formData.gender : "",
        track: needsTrack ? formData.track : "",
        studentNumber: isStudent ? formData.studentNumber : "",
        cohort: needsCohort ? formData.cohort : "",
        classNo: isStudent ? formData.classNo : "",
        dormRoom: isStudent ? formData.dormRoom : "",
        phoneNumber: isAlumni ? "" : formData.phoneNumber,
        birthday: hasValidBirthday
          ? toIsoDate(formData.birthYear, formData.birthMonth, formData.birthDay)
          : "",
      },
      { method: "post" }
    )
  }

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-8">
        <header className="text-center">
          <p className="text-foreground text-2xl font-bold tracking-tight">KMLA Online</p>
          <p className="text-muted-foreground mt-1.5 text-sm">프로필을 설정하세요</p>
        </header>

        <section className="bg-card text-card-foreground rounded-xl border shadow-xs">
          <div className="p-6 md:p-8">
            <div className="mb-7 flex gap-1.5" aria-label={`4단계 중 ${step}단계`}>
              {[1, 2, 3, 4].map((progressStep) => (
                <div
                  key={progressStep}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    step >= progressStep ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {step === 1 && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">
                    이름 <RequiredMark />
                  </Label>
                  <Input
                    id="name"
                    placeholder="이름을 입력하세요"
                    value={formData.name}
                    onChange={(event) => updateField("name", event.target.value)}
                    autoFocus
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="type">
                    구분 <RequiredMark />
                  </Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => updateField("type", value as ProfileType)}
                  >
                    <SelectTrigger id="type" className="w-full">
                      <SelectValue placeholder="구분을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="student">재학생</SelectItem>
                        <SelectItem value="alumni">졸업생</SelectItem>
                        <SelectItem value="teacher">선생님</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                {needsGender ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="gender">
                      성별 <RequiredMark />
                    </Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(value) => updateField("gender", value)}
                    >
                      <SelectTrigger id="gender" className="w-full">
                        <SelectValue placeholder="성별을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="male">남성</SelectItem>
                          <SelectItem value="female">여성</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <Button
                  type="button"
                  className="w-full"
                  disabled={!canProceedFromProfile}
                  onClick={() => setStep(2)}
                >
                  다음
                </Button>
                {!canProceedFromProfile && (
                  <p
                    role="alert"
                    aria-live="polite"
                    className="text-destructive text-center text-xs"
                  >
                    {needsGender
                      ? "이름, 구분, 성별을 모두 입력해야 다음 단계로 넘어갈 수 있습니다."
                      : "이름과 구분을 모두 입력해야 다음 단계로 넘어갈 수 있습니다."}
                  </p>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-muted-foreground hover:text-foreground -ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                    aria-label="이전 단계로"
                  >
                    <ChevronLeft />
                  </button>
                  <h1 className="text-lg font-semibold">
                    {isStudent ? "재학생 정보" : isAlumni ? "졸업생 정보" : "선생님 정보"}
                  </h1>
                </div>

                {isStudent && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="studentNumber">
                        학번 <RequiredMark />
                      </Label>
                      <Input
                        id="studentNumber"
                        inputMode="numeric"
                        value={formData.studentNumber}
                        onChange={(event) =>
                          updateField(
                            "studentNumber",
                            event.target.value.replace(/\D/g, "").slice(0, 6)
                          )
                        }
                        required
                        aria-invalid={!!fieldErrors.studentNumber}
                      />
                      {fieldErrors.studentNumber && (
                        <p role="alert" aria-live="polite" className="text-destructive text-xs">
                          {fieldErrors.studentNumber}
                        </p>
                      )}
                    </div>

                    <BirthdayFields
                      required
                      year={formData.birthYear}
                      month={formData.birthMonth}
                      day={formData.birthDay}
                      onChange={updateField}
                    />
                    {fieldErrors.birthday && (
                      <p role="alert" aria-live="polite" className="text-destructive -mt-3 text-xs">
                        {fieldErrors.birthday}
                      </p>
                    )}
                  </>
                )}

                {needsCohort && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cohort">
                      기수 <RequiredMark />
                    </Label>
                    <Input
                      id="cohort"
                      inputMode="numeric"
                      placeholder="예: 28"
                      value={formData.cohort}
                      onChange={(event) =>
                        updateField("cohort", event.target.value.replace(/\D/g, "").slice(0, 2))
                      }
                      required
                      aria-invalid={!!fieldErrors.cohort}
                    />
                    {fieldErrors.cohort && (
                      <p role="alert" aria-live="polite" className="text-destructive text-xs">
                        {fieldErrors.cohort}
                      </p>
                    )}
                  </div>
                )}

                {needsTrack && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="track">
                      계열 <RequiredMark />
                    </Label>
                    <Select
                      value={formData.track}
                      onValueChange={(value) => updateField("track", value as ProfileTrack)}
                    >
                      <SelectTrigger id="track" className="w-full">
                        <SelectValue placeholder="계열을 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="domestic">국내반</SelectItem>
                          <SelectItem value="international">국제반</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {isAlumni && (
                  <>
                    <BirthdayFields
                      required={false}
                      year={formData.birthYear}
                      month={formData.birthMonth}
                      day={formData.birthDay}
                      onChange={updateField}
                    />
                    {fieldErrors.birthday && (
                      <p role="alert" aria-live="polite" className="text-destructive -mt-3 text-xs">
                        {fieldErrors.birthday}
                      </p>
                    )}
                  </>
                )}

                {(isStudent || isTeacher) && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="phoneNumber">
                      전화번호 <OptionalText recommended={isStudent} />
                    </Label>
                    <Input
                      id="phoneNumber"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      placeholder="예: 01012345678"
                      value={formData.phoneNumber}
                      onChange={(event) =>
                        updateField(
                          "phoneNumber",
                          event.target.value.replace(/\D/g, "").slice(0, 11)
                        )
                      }
                      aria-invalid={!!fieldErrors.phoneNumber}
                    />
                    {fieldErrors.phoneNumber && (
                      <p role="alert" aria-live="polite" className="text-destructive text-xs">
                        {fieldErrors.phoneNumber}
                      </p>
                    )}
                  </div>
                )}

                {isStudent && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="dormRoom">
                        기숙사 방 <OptionalText />
                      </Label>
                      <Input
                        id="dormRoom"
                        type="number"
                        min={1}
                        placeholder="예: 302"
                        value={formData.dormRoom}
                        onChange={(event) => updateField("dormRoom", event.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="classNo">
                        반 <OptionalText />
                      </Label>
                      <Input
                        id="classNo"
                        type="number"
                        min={1}
                        max={10}
                        placeholder="예: 3"
                        value={formData.classNo}
                        onChange={(event) => {
                          updateField("classNo", event.target.value)
                        }}
                      />
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full"
                  disabled={!canProceedFromDetails}
                  onClick={() => setStep(3)}
                >
                  다음
                </Button>
              </div>
            )}

            {step === 3 && (
              <form
                className="flex flex-col gap-6"
                onSubmit={(event) => {
                  event.preventDefault()
                  setStep(4)
                }}
              >
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-muted-foreground hover:text-foreground -ml-1 w-fit rounded-lg p-1 transition-colors"
                  aria-label="이전 단계로"
                >
                  <ChevronLeft />
                </button>

                <div className="text-center">
                  <h1 className="text-lg font-semibold">프로필 이미지를 선택하세요</h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    건너뛰고 나중에 추가할 수도 있습니다.
                  </p>
                </div>

                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <ProfileAvatar
                      profile={{ name: formData.name || "사용자", avatarUrl: avatarPreview }}
                      className="size-28"
                      imageAlt="선택한 프로필 이미지 미리보기"
                    />
                    <span className="bg-primary text-primary-foreground ring-background absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full ring-4">
                      <Camera />
                    </span>
                  </div>

                  <Label
                    htmlFor="avatar"
                    className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors"
                  >
                    <Upload />
                    {avatarFile ? "다른 이미지 선택" : "이미지 선택"}
                  </Label>
                  <Input
                    id="avatar"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleAvatarChange}
                    className="sr-only"
                  />

                  {avatarFile ? (
                    <p className="text-muted-foreground max-w-full truncate text-xs">
                      {avatarFile.name}
                    </p>
                  ) : null}
                </div>

                <Button type="submit" className="w-full">
                  다음
                </Button>
              </form>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-6">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-muted-foreground hover:text-foreground -ml-1 w-fit rounded-lg p-1 transition-colors"
                  aria-label="이전 단계로"
                >
                  <ChevronLeft />
                </button>

                <div className="text-center">
                  <h1 className="text-lg font-semibold">이메일 인증</h1>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {email ? (
                      <>
                        <span className="text-foreground font-medium">{email}</span> 로 6자리 인증
                        코드를 보냅니다.
                      </>
                    ) : (
                      "가입한 이메일로 6자리 인증 코드를 보냅니다."
                    )}
                  </p>
                </div>

                {submitError && (
                  <p
                    role="alert"
                    aria-live="polite"
                    className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    {submitError}
                  </p>
                )}

                {otpSent ? (
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      submitVerify()
                    }}
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="otp">인증 코드</Label>
                      <Input
                        id="otp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="6자리 코드"
                        value={otp}
                        onChange={(event) =>
                          setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        autoFocus
                        required
                      />
                      <p className="text-muted-foreground text-xs">
                        이메일에서 받은 코드를 입력하세요.{" "}
                        <button
                          type="button"
                          onClick={sendOtp}
                          disabled={isSubmitting}
                          className="text-primary underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          코드 재전송
                        </button>
                      </p>
                    </div>

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isSubmitting || otp.length < 6}
                    >
                      {isSubmitting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                      {isSubmitting ? "확인 중..." : "인증하고 완료하기"}
                    </Button>
                  </form>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={sendOtp}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                    {isSubmitting ? "보내는 중..." : "인증 코드 보내기"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
