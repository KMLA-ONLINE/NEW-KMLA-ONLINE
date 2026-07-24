import { AppShell } from "~/components/layout/app-shell"
import { NotiProvider } from "~/components/noti/noti-provider"

export default function AppLayout() {
  // 이메일은 아직 목이다. 백엔드를 붙일 때 `clientLoader`에서 세션(브라우저 Supabase 클라이언트)으로
  // 교체한다 -- SPA라 서버 loader는 없다.
  // 알림 상태는 셸 바깥에 있어야 한다: 내비 뱃지(사이드바·탭바)와 /noti 페이지가 셸 안에서
  // 형제라 둘 다 닿으려면 여기서 감싸는 수밖에 없다.
  return (
    <NotiProvider>
      <AppShell email="user@kmla" />
    </NotiProvider>
  )
}
