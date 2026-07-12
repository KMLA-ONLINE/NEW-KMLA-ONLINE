// 로컬 DB에 supabase/tests/*.sql을 순서대로 돌린다. 파일마다 자기 begin/rollback을 갖고
// 있어서 서로 독립이고, 하나만 따로 돌려도 된다:
//
//   node supabase/tests/run.mjs            전부
//   node supabase/tests/run.mjs 05-chat    이름에 05-chat이 들어가는 것만
//
// psql은 컨테이너 안에 있고 .sql은 호스트에 있어서, 파일을 stdin으로 밀어 넣는다.
import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const container = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_NEW-KMLA-ONLINE"
const filter = process.argv[2]

const files = readdirSync(here)
  .filter((name) => name.endsWith(".sql"))
  .filter((name) => !filter || name.includes(filter))
  .sort()

if (files.length === 0) {
  console.error(filter ? `일치하는 테스트가 없습니다: ${filter}` : "테스트 파일이 없습니다.")
  process.exit(1)
}

let failed = 0

for (const file of files) {
  try {
    execFileSync(
      "docker",
      // ON_ERROR_STOP이 없으면 psql이 실패한 문장을 지나쳐 계속 달리고 0으로 끝난다.
      ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-q", "-v", "ON_ERROR_STOP=1"],
      { input: readFileSync(join(here, file)), stdio: ["pipe", "ignore", "pipe"] }
    )
    console.log(`  ok  ${file}`)
  } catch (error) {
    failed++
    console.error(`FAIL  ${file}`)
    const detail = String(error.stderr ?? error.message).trim()
    console.error(
      detail
        .split("\n")
        .map((line) => `      ${line}`)
        .join("\n")
    )
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${files.length} 실패`)
  process.exit(1)
}
console.log(`\n${files.length}/${files.length} 통과`)
