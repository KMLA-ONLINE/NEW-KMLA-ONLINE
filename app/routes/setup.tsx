import { useState } from "react"
import {
  redirect,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router"
import { ChevronLeft, Loader2 } from "lucide-react"

import { createClient } from "~/lib/supabase/server"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // const { supabase } = createClient(request)
  // const { data, error } = await supabase.auth.getUser()
  // if (error || !data?.user) {
  //   return redirect("/login")
  // }
  // return { email: data.user.email ?? "" }
  return { email: "test@kmla.org" }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Not authenticated" }
  }

  const formData = await request.formData()
  const name = String(formData.get("name") ?? "")
  const type = String(formData.get("type") ?? "")
  const gender = String(formData.get("gender") ?? "")
  const studentNumber = String(formData.get("studentNumber") ?? "")
  const cohort = formData.get("cohort") ? Number(formData.get("cohort")) : null
  const classNo = formData.get("classNo") ? Number(formData.get("classNo")) : null
  const birthday = String(formData.get("birthday") ?? "")
  const phoneNumber = String(formData.get("phoneNumber") ?? "")
  const dormRoom = formData.get("dormRoom") ? Number(formData.get("dormRoom")) : null

  const { error } = await supabase.from("profiles").upsert({
    auth_user_id: user.id,
    name,
    type,
    gender: gender || null,
    student_number: studentNumber || null,
    cohort,
    class_no: classNo,
    birthday: birthday || null,
    phone_number: phoneNumber || null,
    dorm_room: dormRoom,
    status: "pending",
    onboarding_completed_at: new Date().toISOString(),
  })

  if (error) {
    return { error: error.message }
  }

  return redirect("/?onboarding=pending")
}

export default function Setup() {
  const { email } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()

  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    gender: "",
    studentNumber: "",
    cohort: "",
    classNo: "",
    birthday: "",
    phoneNumber: "",
    dormRoom: "",
  })

  const loading = fetcher.state === "submitting"
  const error = fetcher.data?.error
  const isStudent = formData.type === "student"

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const canProceed = () => {
    if (!formData.name.trim()) return false
    if (!formData.type) return false
    return true
  }

  const canSubmit = () => {
    if (isStudent) {
      if (!formData.studentNumber || formData.studentNumber.length !== 6) return false
      if (!formData.cohort) return false
    }
    return true
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-8">
          <div className="text-center">
            <p className="text-foreground text-2xl font-bold tracking-tight">KMLA Online</p>
            <p className="text-muted-foreground mt-1.5 text-sm">Set up your profile</p>
          </div>

          <div className="bg-card text-card-foreground rounded-xl border shadow-xs">
            <div className="p-6 md:p-8">
              <div className="mb-6 flex gap-1.5">
                <div
                  className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? "bg-primary" : "bg-muted"}`}
                />
                <div
                  className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? "bg-primary" : "bg-muted"}`}
                />
              </div>

              {step === 1 && (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="name" className="text-sm font-medium">
                      Name
                    </Label>
                    <Input
                      id="name"
                      placeholder="Your full name"
                      value={formData.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      autoFocus
                      required
                      className="h-10"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="type" className="text-sm font-medium">
                      I am a...
                    </Label>
                    <Select value={formData.type} onValueChange={(v) => updateField("type", v)}>
                      <SelectTrigger id="type" className="h-10">
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                        <SelectItem value="alumni">Alumni</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="gender" className="text-sm font-medium">
                      Gender
                    </Label>
                    <Select value={formData.gender} onValueChange={(v) => updateField("gender", v)}>
                      <SelectTrigger id="gender" className="h-10">
                        <SelectValue placeholder="Select your gender" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    className="h-10 w-full"
                    disabled={!canProceed()}
                    onClick={() => setStep(2)}
                  >
                    Next
                  </Button>
                </div>
              )}

              {step === 2 && (
                <fetcher.Form method="post" className="flex flex-col gap-5">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-muted-foreground hover:text-foreground mb-1 -ml-1 rounded-lg p-1 transition-colors"
                  >
                    <ChevronLeft className="size-5" />
                  </button>

                  {error && (
                    <p className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm font-medium">
                      {error}
                    </p>
                  )}

                  <input type="hidden" name="name" value={formData.name} />
                  <input type="hidden" name="type" value={formData.type} />
                  <input type="hidden" name="gender" value={formData.gender} />

                  {isStudent && (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="studentNumber" className="text-sm font-medium">
                          Student number <span className="text-muted-foreground">(6 digits)</span>
                        </Label>
                        <Input
                          id="studentNumber"
                          name="studentNumber"
                          placeholder="e.g. 250001"
                          value={formData.studentNumber}
                          onChange={(e) => updateField("studentNumber", e.target.value)}
                          maxLength={6}
                          required
                          className="h-10"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="cohort" className="text-sm font-medium">
                          Cohort (기수)
                        </Label>
                        <Input
                          id="cohort"
                          name="cohort"
                          type="number"
                          placeholder="e.g. 28"
                          value={formData.cohort}
                          onChange={(e) => updateField("cohort", e.target.value)}
                          required
                          className="h-10"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="classNo" className="text-sm font-medium">
                          Class number (반)
                        </Label>
                        <Input
                          id="classNo"
                          name="classNo"
                          type="number"
                          placeholder="e.g. 3"
                          value={formData.classNo}
                          onChange={(e) => updateField("classNo", e.target.value)}
                          className="h-10"
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="dormRoom" className="text-sm font-medium">
                          Dorm room
                        </Label>
                        <Input
                          id="dormRoom"
                          name="dormRoom"
                          type="number"
                          placeholder="e.g. 302"
                          value={formData.dormRoom}
                          onChange={(e) => updateField("dormRoom", e.target.value)}
                          className="h-10"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="birthday" className="text-sm font-medium">
                      Birthday
                    </Label>
                    <Input
                      id="birthday"
                      name="birthday"
                      type="date"
                      value={formData.birthday}
                      onChange={(e) => updateField("birthday", e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="phoneNumber" className="text-sm font-medium">
                      Phone number <span className="text-muted-foreground">(recommended)</span>
                    </Label>
                    <Input
                      id="phoneNumber"
                      name="phoneNumber"
                      type="tel"
                      placeholder="e.g. 010-1234-5678"
                      value={formData.phoneNumber}
                      onChange={(e) => updateField("phoneNumber", e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <Button type="submit" className="h-10 w-full" disabled={loading || !canSubmit()}>
                    {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                    {loading ? "Submitting..." : "Complete setup"}
                  </Button>
                </fetcher.Form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
