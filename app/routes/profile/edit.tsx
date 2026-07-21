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

/**
 * /profile/:profileId/edit. 프로필 위에 뜨는 모달이라 뒤에 편집 대상이 그대로 보인다 --
 * 그룹의 글쓰기·수정과 같은 패턴이고, 라우트라서 주소가 남고 뒤로가기로 닫힌다.
 *
 * 있는 칸은 `profiles`의 update 컬럼 grant가 정한다: name, gender, phone_number, birthday,
 * description, cohort, class_no, track, department, dorm_room. 그 열 개가 전부다.
 *
 * 학번은 없다. 심사에서 신원을 대조한 값이고 unique라, 열어두면 남의 학번을 선점하거나 심사받은
 * 신원과 다른 사람이 될 수 있다 -- 본문에 읽기로만 있다. 이전 화면에 있던 전공·좌우방 칸도
 * 지웠다. 스키마에 그런 컬럼이 아예 없어서 저장될 곳이 없는 칸이었다.
 *
 * TODO(backend): 저장은 `clientAction`에서 브라우저 Supabase 클라이언트로 한다.
 *   - `supabase.from("profiles").update({ ... }).eq("id", ...)`. id는 `get_my_profile()`로 읽는다
 *     (클라이언트가 보낸 id를 쓰지 않는다). `profiles_update`가 `id = current_profile_id()`로 다시 잠근다.
 *   - `phone_number`는 하이픈을 떨구고 보낸다 -- `profiles_phone_number_check`가 `^\+?[0-9]{8,15}$`라
 *     사람이 적은 `010-1234-5678`을 그대로 보내면 DB가 거절하고 사용자는 왜인지 알 수 없다.
 *   - 빈 칸은 `""`가 아니라 `null`이다. 숫자 칸(기수·반·방)은 `Number()`로 바꿔 보낸다.
 *   - 성공 응답을 받은 뒤에만 close()를 부른다. 실패하면 모달을 닫지 않고 입력을 그대로 둔다.
 */
export default function ProfileEditPage() {
  const { profile } = useProfileContext()
  // 딥링크로 들어오면 돌아갈 히스토리가 없다. 그때는 프로필 본문으로 replace 이동한다.
  const close = useModalClose("..")
  // 학생만 기수·계열을 갖는다. 선생님·졸업생에게는 그 두 칸이 애초에 존재하지 않는다.
  const isStudent = profile.type === "student"

  // 칸이 열 개라 각각 ref로 원래 값과 대조하는 대신, 폼 전체의 변경 이벤트 하나로 dirty를 잡는다.
  // Select(Radix)는 native input이 아니라 ref 대조가 애초에 통하지 않기도 한다. 되돌려 놓아도
  // dirty로 남지만, 그 대가로 "안 고쳤는데 확인창이 뜬다"가 아니라 "고쳤다 되돌렸는데 뜬다"가
  // 된다 -- 놓치는 쪽보다 덜 나쁘다.
  const [isDirty, setIsDirty] = useState(false)
  const checkIsDirty = useCallback(() => isDirty, [isDirty])
  const { isConfirmingDiscard, allowNextClose, confirmDiscard, cancelDiscard } =
    useCloseConfirmation(checkIsDirty)

  // setup.tsx(온보딩)와 같은 입력 제약을 저장 전에 화면에서 건다 -- 안 그러면 나중에 백엔드를
  // 붙였을 때 DB의 check(profiles_phone_number_check 등)가 조용히 거절하고, 사용자는 "왜 안 되지"만
  // 남는다. 폼은 uncontrolled이라(위 주석 참고) 값은 DOM이 들고, 여기서는 형식 오류 메시지와
  // 저장 가능 여부만 DOM에서 파생한다. sanitize(숫자만·자릿수 컷)는 각 입력의 onChange가 직접 한다.
  const formRef = useRef<HTMLFormElement>(null)
  const [phoneError, setPhoneError] = useState("")
  const [cohortError, setCohortError] = useState("")
  const [canSave, setCanSave] = useState(true)

  const validate = () => {
    const form = formRef.current
    if (!form) return
    const read = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? ""

    const name = read("name")
    const phone = read("phone_number")
    // 학생이 아니면 기수 칸 자체가 없다(namedItem은 null -> "").
    const cohort = read("cohort")
    const classNo = read("class_no")
    const dormRoom = read("dorm_room")

    const phoneOk = !phone || /^\d{10,11}$/.test(phone)
    const cohortOk = !isStudent || /^\d{2}$/.test(cohort)
    const classNoOk = !classNo || (Number(classNo) >= 1 && Number(classNo) <= 10)
    const dormRoomOk = !dormRoom || Number(dormRoom) >= 1

    setCanSave(Boolean(name) && phoneOk && cohortOk && classNoOk && dormRoomOk)
  }

  // 첫 렌더에서도 defaultValue들이 규칙을 만족하는지 확인해 저장 버튼 상태를 맞춘다.
  useEffect(() => {
    validate()
    // 마운트 시 한 번만. validate는 DOM에서 읽으므로 의존성이 없다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            <Button
              size="sm"
              disabled={!canSave}
              onClick={() => {
                allowNextClose()
                close()
              }}
            >
              저장
            </Button>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <form
              ref={formRef}
              className="grid gap-5"
              aria-label="프로필 편집 양식"
              onChange={() => {
                setIsDirty(true)
                validate()
              }}
            >
              {/* 사진은 프로필 화면의 커버·아바타 위에서 바꾼다. 여기서는 그 자리로 보내기만 한다 --
                  같은 동작을 두 곳에 두면 한쪽이 낡는다. */}
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
                <Field label="성별" htmlFor="gender">
                  {/* 성별은 온보딩에서도 선택값이라 비어 있을 수 있다. defaultValue가 undefined면
                      placeholder가 그대로 남는다. */}
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

                <Field label="생일" htmlFor="birthday">
                  <Input
                    id="birthday"
                    name="birthday"
                    type="date"
                    defaultValue={profile.birthday ?? ""}
                  />
                </Field>

                <Field label="전화번호" htmlFor="phone_number">
                  {/* 하이픈은 아예 못 넣게 숫자만 남긴다 -- profiles_phone_number_check가 `^\+?[0-9]{8,15}$`라
                      `010-1234-5678`을 그대로 보내면 DB가 거절한다. 앱 규칙은 setup과 같은 10~11자리. */}
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
              </div>

              <SectionDivider label="학교" />

              <div className="grid gap-5 sm:grid-cols-2">
                {isStudent ? (
                  <>
                    <Field label="기수" htmlFor="cohort">
                      {/* setup과 같은 규칙: 2자리 숫자. 숫자만 남기고 2자리에서 자른다. */}
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
                        defaultValue={profile.track ?? undefined}
                        onValueChange={() => setIsDirty(true)}
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
                    </Field>
                  </>
                ) : null}

                <Field label="반" htmlFor="class_no">
                  {/* 기수와 같은 방식으로 숫자만 2자리까지. 범위(1~10)는 validate가 저장 전에 본다. */}
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
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="305"
                    defaultValue={profile.dorm_room ?? ""}
                  />
                </Field>

                <Field label="부서" htmlFor="department">
                  {/* 자유 입력이 아니라 lookup FK다(profile_departments). 목록 밖의 이름은 DB가
                      거절하므로 텍스트 입력을 주면 안 된다. */}
                  <Select
                    name="department"
                    defaultValue={profile.department ?? undefined}
                    onValueChange={() => setIsDirty(true)}
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

/**
 * 나가기 확인. 이 모달 **안에** 겹쳐 그린다 -- 별도의 AlertDialog로 띄우면 안 된다.
 *
 * Radix 모달이 둘 동시에 열렸다 닫히면 `document.body`의 `pointer-events: none`이 복구되지
 * 않는다. 두 layer가 body 잠금을 참조 계수로 공유하는데, 라우트 이동으로 둘이 한꺼번에
 * 사라지는 경로에서 그 계수가 어긋나기 때문이다. 결과는 조용하고 치명적이다: 모달은 정상적으로
 * 닫히고, 프로필 화면이 멀쩡히 보이고, 그런데 아무것도 클릭되지 않는다. 새로고침 말고는 길이 없다.
 *
 * (`supabase/tests`가 아니라 `profile.test.tsx`가 이걸 지킨다 -- 닫은 뒤 body 스타일이 풀렸는지
 * 보는 회귀 테스트가 거기 있다.)
 *
 * 그래서 Radix layer는 바깥 Dialog 하나로 유지하고, 확인창은 그 안의 평범한 div로 그린다.
 * 대신 모달이 스스로 해주던 것들을 여기서 직접 챙긴다: role/aria, 열릴 때 포커스 이동, Esc.
 */
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
      // Esc는 바깥 Dialog까지 올라가면 안 된다. 여기서 멈추고 "계속 편집"으로 해석한다 --
      // 확인창을 띄워놓고 Esc 한 번에 편집 내용이 사라지면 확인창을 띄운 의미가 없다.
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

// 사진 변경이 어디 있는지 알려주는 줄. 버튼이 아니라 안내다 -- 실제 컨트롤은 커버와 아바타 위에
// 하나씩만 있고, 그게 바꾸려는 대상 바로 위라는 것이 요점이다.
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

// 한 폼 안의 구획선. 개인 정보와 학교 정보는 성격이 다르고(하나는 본인 것, 하나는 학교가 준
// 것), 학번이 왜 여기 없는지도 이 자리에서 말해줘야 한다 -- 없는 칸은 스스로를 설명하지 못한다.
function SectionDivider({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="border-t pt-4">
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
