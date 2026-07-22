import { redirect } from "react-router"

import { mockProfile } from "~/lib/profile/mock-data"

export function clientLoader() {
  return redirect(`/profile/${mockProfile.id}`)
}

export default function ProfileMeRedirect() {
  return null
}
