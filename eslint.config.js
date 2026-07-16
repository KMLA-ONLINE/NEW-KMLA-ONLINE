import js from "@eslint/js"
import globals from "globals"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"
import eslintConfigPrettier from "eslint-config-prettier"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores(["dist", "build", ".react-router", "app/lib/supabase/database.types.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintConfigPrettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn", // error → warn
      "react-refresh/only-export-components": "warn", // error → warn
      // useIsomorphicLayoutEffect은 useLayoutEffect의 SSR 안전판이다. 등록하지 않으면
      // exhaustive-deps가 커스텀 훅이라 보고 그냥 지나쳐, 그 안의 의존성 배열만 조용히
      // 검사에서 빠진다.
      "react-hooks/exhaustive-deps": ["warn", { additionalHooks: "^useIsomorphicLayoutEffect$" }],
      // 이미지 업로드는 storage.ts의 uploadImage()만 지나게 강제한다(그 안에서 compressImage로
      // 압축을 박음). raw `.from(bucket).upload()`를 그 밖에서 부르면 압축이 새므로 막는다.
      // `.from().upload()`/`.uploadToSignedUrl()` 인라인 호출을 잡는다. 아래 override 두 블록이
      // 이 문(storage.ts)과 테스트에서만 예외를 연다.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(upload|uploadToSignedUrl)$/][callee.object.callee.property.name='from']",
          message:
            "이미지/파일 업로드는 app/lib/supabase/storage.ts의 헬퍼(uploadImage 등)만 사용하세요 — 헬퍼가 compressImage로 압축을 강제합니다. raw storage upload 금지.",
        },
      ],
    },
  },
  {
    files: ["app/root.tsx", "app/routes/**/*.tsx", "app/components/ui/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  // 업로드의 유일한 문. 여기서만 raw storage upload가 허용된다.
  {
    files: ["app/lib/supabase/storage.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  // 테스트는 storage를 직접 두드려 계약을 검증한다(E2EE 암호문 업로드 등, 압축 대상 아님).
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
])
