import { data as responseData, useLoaderData, type LoaderFunctionArgs } from "react-router"

import { AppShell } from "~/components/layout/app-shell"
import { NotiProvider } from "~/components/noti/noti-provider"
import { createClient } from "~/lib/supabase/server"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request)
  const { data: authData } = await supabase.auth.getUser()

  // if (error || !data?.user) {
  //   return redirect("/login")
  // }

  return responseData({ email: authData.user?.email ?? "user@kmla" }, { headers })
}

export default function AppLayout() {
  const data = useLoaderData<typeof loader>()
  // 알림 상태는 셸 바깥에 있어야 한다: 내비 뱃지(사이드바·탭바)와 /noti 페이지가 셸 안에서
  // 형제라 둘 다 닿으려면 여기서 감싸는 수밖에 없다.
  return (
    <NotiProvider>
      <AppShell email={data.email} />
    </NotiProvider>
  )
}
