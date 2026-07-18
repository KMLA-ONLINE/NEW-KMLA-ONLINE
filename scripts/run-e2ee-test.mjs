import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const url = "http://127.0.0.1:54721/rest/v1/"
const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

const reachable = await fetch(url, {
  headers: { apikey: anonKey },
  signal: AbortSignal.timeout(2_000),
})
  .then((response) => response.ok)
  .catch(() => false)

if (!reachable) {
  console.error("[e2ee] 로컬 Supabase가 필요합니다: npx supabase start")
  process.exit(1)
}

const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url))
const result = spawnSync(
  process.execPath,
  [vitest, "run", "app/lib/crypto/e2ee.integration.test.ts"],
  { stdio: "inherit" }
)

if (result.error) throw result.error
process.exit(result.status ?? 1)