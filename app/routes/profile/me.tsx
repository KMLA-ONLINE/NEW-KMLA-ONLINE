import { redirect } from "react-router"

import { mockProfile } from "~/lib/profile/mock-data"

/**
 * /profile은 화면이 아니라 이정표다. 내 프로필로 보내고 끝난다 -- 남의 프로필과 같은 화면,
 * 같은 라우트(/profile/:profileId)를 쓰기 위해서다. 둘을 다른 라우트로 두면 "내 프로필"과
 * "남의 프로필"이 서서히 다른 화면으로 갈라진다.
 *
 * 메뉴의 계정 블록처럼 내 id를 아직 모르는 자리에서 /profile로 걸어둘 수 있는 것도 이 덕이다.
 *
 * TODO(backend): `get_my_profile()`로 내 id를 읽어 redirect한다. 세션이 없으면 /login,
 * status가 none/rejected면 /setup, pending이면 /pending으로 간다(RLS가 status로 가르므로
 * 승인 전에는 프로필을 그려봐야 빈 껍데기다).
 */
export function clientLoader() {
  return redirect(`/profile/${mockProfile.id}`)
}

// redirect만 하는 라우트라 그릴 것이 없다. 그래도 컴포넌트는 있어야 한다.
export default function ProfileMeRedirect() {
  return null
}
