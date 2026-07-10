import type { ReactNode } from "react"
import { ArrowLeftIcon, SaveIcon } from "lucide-react"
import { Link } from "react-router"

import { Button } from "~/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader } from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

const mockProfile = {
  major: "생명공학, 유전공학",
  studentNumber: "251000",
  phoneNumber: "010-0000-0000",
  email: "minjok.kim@kmlaonline.kr",
  birthday: "2009-03-01",
  dormRoom: "305",
  dormSide: "left",
  department: "과기부",
  gender: "male",
}

export function ProfileEditPageContent() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Button asChild variant="ghost" className="w-fit px-0 hover:bg-transparent">
        <Link to="/profile">
          <ArrowLeftIcon className="size-4" />
        </Link>
      </Button>

      <Card className="border-border/70 shadow-xs">
        <CardHeader>
          <h1 className="font-heading text-2xl leading-normal font-medium">프로필 편집</h1>
          <CardDescription>목업 데이터로 구성된 정적 편집 화면입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-5" aria-label="프로필 편집 양식">
            <div className="grid gap-5 sm:grid-cols-2">
              <ProfileField label="전공" htmlFor="major">
                <Input id="major" name="major" defaultValue={mockProfile.major} />
              </ProfileField>

              <ProfileField label="학번" htmlFor="studentNumber">
                <Input
                  id="studentNumber"
                  name="studentNumber"
                  defaultValue={mockProfile.studentNumber}
                />
              </ProfileField>

              <ProfileField label="전화번호" htmlFor="phoneNumber">
                <Input id="phoneNumber" name="phoneNumber" defaultValue={mockProfile.phoneNumber} />
              </ProfileField>

              <ProfileField label="이메일" htmlFor="email">
                <Input id="email" name="email" type="email" defaultValue={mockProfile.email} />
              </ProfileField>

              <ProfileField label="방" htmlFor="dormRoom">
                <div className="flex gap-2">
                  <Input
                    id="dormRoom"
                    name="dormRoom"
                    defaultValue={mockProfile.dormRoom}
                    className="flex-1"
                  />
                  <div
                    role="group"
                    aria-label="방 방향"
                    className="border-border bg-muted/30 flex shrink-0 overflow-hidden rounded-md border p-0.5"
                  >
                    <Button
                      type="button"
                      variant={mockProfile.dormSide === "left" ? "default" : "ghost"}
                      size="sm"
                      aria-pressed={mockProfile.dormSide === "left"}
                      className="h-8 rounded-sm px-3"
                    >
                      좌방
                    </Button>
                    <Button
                      type="button"
                      variant={mockProfile.dormSide === "right" ? "default" : "ghost"}
                      size="sm"
                      aria-pressed={mockProfile.dormSide === "right"}
                      className="h-8 rounded-sm px-3"
                    >
                      우방
                    </Button>
                  </div>
                </div>
              </ProfileField>

              <ProfileField label="부서" htmlFor="department">
                <Input id="department" name="department" defaultValue={mockProfile.department} />
              </ProfileField>

              <ProfileField label="생일" htmlFor="birthday">
                <Input
                  id="birthday"
                  name="birthday"
                  type="date"
                  defaultValue={mockProfile.birthday}
                />
              </ProfileField>

              <ProfileField label="성별" htmlFor="gender">
                <Select name="gender" defaultValue={mockProfile.gender}>
                  <SelectTrigger id="gender" className="w-full">
                    <SelectValue placeholder="성별 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">남자</SelectItem>
                    <SelectItem value="female">여자</SelectItem>
                  </SelectContent>
                </Select>
              </ProfileField>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button asChild variant="outline" className="h-11 sm:h-10">
                <Link to="/profile">취소</Link>
              </Button>
              <Button type="button" className="h-11 sm:h-10">
                <SaveIcon className="size-4" />
                저장
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}

function ProfileField({
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
