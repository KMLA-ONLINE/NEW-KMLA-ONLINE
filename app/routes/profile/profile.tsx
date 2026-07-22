import { Outlet, useOutletContext, useParams, useSearchParams } from "react-router"

import { ProfileHero } from "~/components/profile/profile-hero"
import { ProfileInfo } from "~/components/profile/profile-info"
import {
  mockProfileAvatarUrl,
  mockProfileCoverUrl,
  mockProfileForPreview,
} from "~/lib/profile/mock-data"
import type { MyProfile } from "~/lib/profile/types"

export const handle = {
  showMobileHeader: false,
  mobileContentEdge: "inset",
}

export type ProfileOutletContext = { profile: MyProfile }

export default function ProfilePage() {
  const { profileId } = useParams()
  const [searchParams] = useSearchParams()
  const profile = mockProfileForPreview(searchParams.get("as"))
  const isMe = Number(profileId) === profile.id

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <ProfileHero
        profile={profile}
        avatarUrl={mockProfileAvatarUrl}
        coverUrl={mockProfileCoverUrl}
        isMe={isMe}
        editTo={searchParams.size > 0 ? `edit?${searchParams}` : "edit"}
      />
      <ProfileInfo profile={profile} />
      <Outlet context={{ profile } satisfies ProfileOutletContext} />
    </main>
  )
}

export function useProfileContext(): ProfileOutletContext {
  return useOutletContext<ProfileOutletContext>()
}
