import { Outlet, useOutletContext, useParams, useSearchParams } from "react-router"

import { ProfileHero } from "~/components/profile/profile-hero"
import { ProfileInfo } from "~/components/profile/profile-info"
import {
  mockProfileAvatarUrl,
  mockProfileCoverUrl,
  mockProfileForPreview,
} from "~/lib/profile/mock-data"
import type { MyProfile } from "~/lib/profile/types"

/** 편집 모달(자식 라우트)이 부모가 읽은 profile을 받는 문. 자기가 다시 읽지 않는다. */
export type ProfileOutletContext = { profile: MyProfile }

/**
 * /profile/:profileId. 내 프로필과 남의 프로필이 같은 화면을 쓴다 -- 다른 라우트로 두면 둘이
 * 서서히 다른 화면으로 갈라진다. 갈리는 지점은 `isMe` 하나뿐이고, 그게 카메라 버튼과 편집
 * 버튼을 켜고 끈다.
 *
 * 편집은 탭이 아니라 자식 라우트(모달)다. 보기와 편집은 같은 데이터의 두 모드지 나란히 고를
 * 두 섹션이 아니라서, 탭으로 두면 "정보를 보다가 편집 탭을 눌러 같은 값을 다시 본다"가 된다.
 * 그룹의 글쓰기·수정과 같은 패턴이다.
 *
 * TODO(backend): `clientLoader`가 `:profileId`로 profile을 읽는다.
 *   - 남의 행: `supabase.from("profiles").select(...).eq("id", profileId).maybeSingle()`.
 *     `profiles_select`가 accepted만 내주므로 없는 사람·미승인·탈퇴는 전부 0행으로 같아 보인다
 *     (그게 맞다 -- "그 학생은 아직 승인 전"이라고 알려줄 이유가 없다).
 *   - 내 행인지 판정: `get_my_profile()`의 id와 비교한다. 화면에서 계산할 수 없는 값이다.
 *   - avatar_url/cover_image_url은 경로일 뿐이라 `createSignedUrlMap`으로 서명해야 <img>에 들어간다.
 */
export default function ProfilePage() {
  const { profileId } = useParams()
  const [searchParams] = useSearchParams()
  const profile = mockProfileForPreview(searchParams.get("as"))
  // 목이라 누구를 요청하든 선택한 변형이 나온다. 대신 id가 내 것과 같은지로 본인 여부를 가려서,
  // 남의 프로필 화면(/profile/2)과 역할별 디자인을 함께 확인할 수 있다.
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

      {/* 편집 모달이 여기 뜬다. 본문은 그대로 뒤에 남는다. */}
      <Outlet context={{ profile } satisfies ProfileOutletContext} />
    </main>
  )
}

export function useProfileContext(): ProfileOutletContext {
  return useOutletContext<ProfileOutletContext>()
}
