import type { Config } from "@react-router/dev/config"
import { vercelPreset } from "@vercel/react-router/vite"

export default {
  // SPA 모드: 서버 렌더링을 끈다. 서버 `loader`/`action`은 전혀 돌지 않으므로(빌드 시 root
  // 셸만 프리렌더된다) 데이터는 라우트의 `clientLoader`/`clientAction`에서 불러온다.
  ssr: false,
  presets: [vercelPreset()],
} satisfies Config
