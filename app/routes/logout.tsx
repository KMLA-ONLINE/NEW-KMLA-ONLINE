import { Loader2 } from "lucide-react"
import { redirect } from "react-router"

import { closeVault } from "~/lib/crypto/vault"
import { createClient } from "~/lib/supabase/client"

/**
 * 로그아웃은 브라우저에서 끝나야 한다. 서버는 세션 쿠키를 지울 수 있을 뿐, 이 기기의
 * IndexedDB에 남아 있는 encKey는 지우지 못한다 -- 그리고 학교 공용 컴퓨터에 남의 열쇠를
 * 두고 나오는 것은 로그아웃이 아니다.
 *
 * 그래서 서버 loader를 두지 않는다. 서버 loader가 있으면 주소창에 /logout을 직접 친 경우
 * (= 문서 요청, 그리고 이 라우트에 링크가 없는 지금은 그게 유일한 경로다) 서버가 먼저
 * 리다이렉트해 버려서 clientLoader가 영영 돌지 않고, 열쇠는 기기에 남는다.
 *
 * createBrowserClient는 세션을 쿠키에 두므로 여기서의 signOut이 서버 쪽 세션도 함께 끝낸다.
 */
export async function clientLoader() {
  await closeVault()
  await createClient().auth.signOut()
  return redirect("/login")
}

function SigningOut() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-4">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        로그아웃 중...
      </div>
    </div>
  )
}

export const HydrateFallback = SigningOut

export default SigningOut
