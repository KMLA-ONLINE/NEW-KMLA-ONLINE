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
  mobileContentEdge: "bleed" as const,
}

export type ProfileOutletContext = { profile: MyProfile; canEdit: boolean }

export default function ProfilePage() {
  const { profileId } = useParams()
  const [searchParams] = useSearchParams()
  const profile = mockProfileForPreview(searchParams.get("as"))
  const canEdit = Number(profileId) === profile.id

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <ProfileHero
        profile={profile}
        avatarUrl={mockProfileAvatarUrl}
        coverUrl={mockProfileCoverUrl}
        isMe={canEdit}
        editTo={searchParams.size > 0 ? `edit?${searchParams}` : "edit"}
      />
      <ProfileInfo profile={profile} />
      {/* TODO: 프로필 loader가 붙으면 viewer 권한으로 canEdit을 계산하고, 비소유자의 edit 직접 접근은 부모 경로로 redirect한다. */}
      {canEdit ? <Outlet context={{ profile, canEdit } satisfies ProfileOutletContext} /> : null}
    </main>
  )
}

export function useProfileContext(): ProfileOutletContext {
  return useOutletContext<ProfileOutletContext>()
}
