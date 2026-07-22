import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { ImageIcon, XIcon } from "lucide-react"

import { useCloseConfirmation } from "~/hooks/use-close-confirmation"
import { useModalClose } from "~/hooks/use-modal-close"
import { useProfileContext } from "~/routes/profile/profile"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { mockProfileDepartments } from "~/lib/profile/mock-data"
import { GENDER_LABEL, TRACK_LABEL } from "~/lib/profile/types"

export default function ProfileEditPage() {
  const { profile } = useProfileContext()
  const close = useModalClose("..")
  const isStudent = profile.type === "student"
  const isTeacher = profile.type === "teacher"
  const hasCohortAndTrack = profile.type === "student" || profile.type === "alumni"

  // Radix Select까지 포함해 한 번이라도 수정되면 이탈 확인을 띄운다.
  const [isDirty, setIsDirty] = useState(false)
  const checkIsDirty = useCallback(() => isDirty, [isDirty])
  const { isConfirmingDiscard, allowNextClose, confirmDiscard, cancelDiscard } =
    useCloseConfirmation(checkIsDirty)

  // 저장 전 DB 제약과 같은 형식만 확인한다.
  const formRef = useRef<HTMLFormElement>(null)
  const [phoneError, setPhoneError] = useState("")
  const [contactEmailError, setContactEmailError] = useState("")
  const [cohortError, setCohortError] = useState("")
  const [track, setTrack] = useState(profile.track ?? "")
  const [trackError, setTrackError] = useState("")
  const [canSave, setCanSave] = useState(true)

  const validate = useCallback(() => {
    const form = formRef.current
    if (!form) return false
    const read = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? ""

    const name = read("name")
    const phone = read("phone_number")
    const contactEmail = read("contact_email")
    const cohort = read("cohort")
    const classNo = read("class_no")
    const dormRoom = read("dorm_room")

    const phoneOk = !phone || /^\d{10,11}$/.test(phone)
    const contactEmailOk = !contactEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
    const cohortOk = !hasCohortAndTrack || /^\d{2}$/.test(cohort)
    const trackOk = !hasCohortAndTrack || /^(domestic|international)$/.test(track)
    const classNoOk =
      !classNo ||
      (Number.isInteger(Number(classNo)) && Number(classNo) >= 1 && Number(classNo) <= 10)
    const dormRoomOk = !dormRoom || (Number.isInteger(Number(dormRoom)) && Number(dormRoom) >= 1)
    const isValid =
      Boolean(name) && phoneOk && contactEmailOk && cohortOk && trackOk && classNoOk && dormRoomOk

    setContactEmailError(contactEmailOk ? "" : "올바른 이메일 주소를 입력해 주세요.")
    setTrackError(trackOk ? "" : "계열을 선택해 주세요.")
    setCanSave(isValid)
    return isValid
  }, [hasCohortAndTrack, track])

  useEffect(() => {
    validate()
  }, [validate])

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[90svh] flex-col gap-0 overflow-hidden p-0 max-sm:top-0 max-sm:left-0 max-sm:h-svh max-sm:max-h-svh max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 sm:max-w-lg"
        >
          <DialogHeader className="flex-row items-center gap-2 border-b p-3 text-left">
            <Button variant="ghost" size="icon-sm" onClick={close} aria-label="닫기">
              <XIcon />
            </Button>
            <DialogTitle className="flex-1 text-base">프로필 편집</DialogTitle>
            <DialogDescription className="sr-only">프로필 정보를 수정합니다.</DialogDescription>
            <Button size="sm" type="submit" form="profile-edit-form" disabled={!canSave}>
              저장
            </Button>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <form
              id="profile-edit-form"
              ref={formRef}
              className="grid gap-5"
              aria-label="프로필 편집 양식"
              onChange={() => {
                setIsDirty(true)
                validate()
              }}
              onSubmit={(event) => {
                event.preventDefault()
                if (!validate()) return
                allowNextClose()
                close()
              }}
            >
              <PhotoShortcut />

              <Field label="이름" htmlFor="name">
                <Input
                  id="name"
                  name="name"
                  defaultValue={profile.name}
                  required
                  maxLength={50}
                  autoComplete="name"
                />
              </Field>

              <Field label="소개" htmlFor="description">
                <textarea
                  id="description"
                  name="description"
                  defaultValue={profile.description ?? ""}
                  maxLength={2000}
                  rows={3}
                  placeholder="자신을 소개해 보세요."
                  className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-[3px]"
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                {!isTeacher ? (
                  <Field label="성별" htmlFor="gender">
                    <Select
                      name="gender"
                      defaultValue={profile.gender ?? undefined}
                      onValueChange={() => setIsDirty(true)}
                    >
                      <SelectTrigger id="gender" className="w-full">
                        <SelectValue placeholder="선택 안 함" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{GENDER_LABEL.male}</SelectItem>
                        <SelectItem value="female">{GENDER_LABEL.female}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}

                <Field
                  label="생일"
                  htmlFor="birthday"
                  action={
                    isTeacher ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="-mr-2 h-7 px-2 text-xs"
                        onClick={() => {
                          const birthday = formRef.current?.elements.namedItem(
                            "birthday"
                          ) as HTMLInputElement | null
                          if (!birthday?.value) return
                          birthday.value = ""
                          setIsDirty(true)
                          validate()
                        }}
                      >
                        지우기
                      </Button>
                    ) : undefined
                  }
                >
                  <Input
                    id="birthday"
                    name="birthday"
                    type="date"
                    defaultValue={profile.birthday ?? ""}
                  />
                </Field>

                <Field label="전화번호" htmlFor="phone_number">
                  <Input
                    id="phone_number"
                    name="phone_number"
                    type="tel"
                    inputMode="numeric"
                    maxLength={11}
                    defaultValue={profile.phone_number ?? ""}
                    placeholder="01012345678"
                    autoComplete="tel"
                    aria-invalid={!!phoneError}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, "").slice(0, 11)
                      event.target.value = digits
                      setPhoneError(
                        digits && !/^\d{10,11}$/.test(digits)
                          ? "전화번호는 10~11자리 숫자여야 합니다."
                          : ""
                      )
                    }}
                  />
                  {phoneError ? (
                    <p role="alert" aria-live="polite" className="text-destructive text-xs">
                      {phoneError}
                    </p>
                  ) : null}
                </Field>

                <Field label="연락처 이메일" htmlFor="contact_email">
                  <Input
                    id="contact_email"
                    name="contact_email"
                    type="email"
                    maxLength={254}
                    defaultValue={profile.contact_email ?? ""}
                    placeholder="name@example.com"
                    autoComplete="email"
                    spellCheck={false}
                    aria-invalid={!!contactEmailError}
                  />
                  {contactEmailError ? (
                    <p role="alert" aria-live="polite" className="text-destructive text-xs">
                      {contactEmailError}
                    </p>
                  ) : null}
                </Field>
              </div>

              <SectionDivider label="학교" />

              <div className="grid gap-5 sm:grid-cols-2">
                {hasCohortAndTrack ? (
                  <>
                    <Field label="기수" htmlFor="cohort">
                      <Input
                        id="cohort"
                        name="cohort"
                        inputMode="numeric"
                        maxLength={2}
                        required
                        defaultValue={profile.cohort ?? ""}
                        aria-invalid={!!cohortError}
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, "").slice(0, 2)
                          event.target.value = digits
                          setCohortError(
                            digits && !/^\d{2}$/.test(digits) ? "기수는 2자리 숫자여야 합니다." : ""
                          )
                        }}
                      />
                      {cohortError ? (
                        <p role="alert" aria-live="polite" className="text-destructive text-xs">
                          {cohortError}
                        </p>
                      ) : null}
                    </Field>

                    <Field label="계열" htmlFor="track">
                      <Select
                        name="track"
                        value={track}
                        onValueChange={(value) => {
                          setTrack(value)
                          setIsDirty(true)
                        }}
                        required
                      >
                        <SelectTrigger id="track" className="w-full">
                          <SelectValue placeholder="계열 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="domestic">{TRACK_LABEL.domestic}</SelectItem>
                          <SelectItem value="international">{TRACK_LABEL.international}</SelectItem>
                        </SelectContent>
                      </Select>
                      {trackError ? (
                        <p role="alert" aria-live="polite" className="text-destructive text-xs">
                          {trackError}
                        </p>
                      ) : null}
                    </Field>
                  </>
                ) : null}

                {isStudent ? (
                  <>
                    <Field label="부서" htmlFor="department">
                      <Select
                        name="department"
                        defaultValue={profile.department ?? undefined}
                        onValueChange={() => {
                          setIsDirty(true)
                          validate()
                        }}
                      >
                        <SelectTrigger id="department" className="w-full">
                          <SelectValue placeholder="선택 안 함" />
                        </SelectTrigger>
                        <SelectContent>
                          {mockProfileDepartments.map((department) => (
                            <SelectItem key={department.name} value={department.name}>
                              {department.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                ) : null}

                {isStudent ? (
                  <>
                    <Field label="반" htmlFor="class_no">
                      <Input
                        id="class_no"
                        name="class_no"
                        inputMode="numeric"
                        maxLength={2}
                        defaultValue={profile.class_no ?? ""}
                        onChange={(event) => {
                          event.target.value = event.target.value.replace(/\D/g, "").slice(0, 2)
                        }}
                      />
                    </Field>

                    <Field label="방" htmlFor="dorm_room">
                      <Input
                        id="dorm_room"
                        name="dorm_room"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="305"
                        defaultValue={profile.dorm_room ?? ""}
                        onChange={(event) => {
                          event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4)
                        }}
                      />
                    </Field>
                  </>
                ) : null}
              </div>
            </form>
          </div>

          {isConfirmingDiscard ? (
            <DiscardConfirm onKeepEditing={cancelDiscard} onDiscard={confirmDiscard} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

// 별도 AlertDialog를 열면 라우트 이동 때 body의 pointer-events가 남는 Radix 버그가 있다.
function DiscardConfirm({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void
  onDiscard: () => void
}) {
  const keepEditingRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    keepEditingRef.current?.focus()
  }, [])

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="discard-title"
      aria-describedby="discard-description"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault()
          event.stopPropagation()
          onKeepEditing()
        }
      }}
      className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center p-6 backdrop-blur-xs"
    >
      <div className="bg-popover text-popover-foreground ring-foreground/10 grid w-full max-w-sm gap-6 rounded-xl p-6 ring-1">
        <div className="grid gap-1.5">
          <h2 id="discard-title" className="font-heading text-lg font-medium">
            저장하지 않고 나갈까요?
          </h2>
          <p id="discard-description" className="text-muted-foreground text-sm">
            수정한 내용이 사라지며 복구할 수 없습니다.
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={keepEditingRef} variant="outline" onClick={onKeepEditing}>
            계속 편집
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            나가기
          </Button>
        </div>
      </div>
    </div>
  )
}

function PhotoShortcut() {
  return (
    <div className="bg-muted/40 text-muted-foreground flex items-start gap-2.5 rounded-lg p-3 text-xs">
      <ImageIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        프로필 사진과 커버 사진은 프로필 화면의 사진 위{" "}
        <ImageIcon className="inline size-3.5 align-text-bottom" aria-hidden="true" /> 버튼에서
        바꿉니다.
      </p>
    </div>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="border-t pt-4">
      <p className="text-sm font-semibold">{label}</p>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  action,
  children,
}: {
  label: string
  htmlFor: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {action}
      </div>
      {children}
    </div>
  )
}
