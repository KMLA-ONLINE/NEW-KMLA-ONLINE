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
    },
  },
  {
    files: ["app/root.tsx", "app/routes/**/*.tsx", "app/components/ui/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
])
