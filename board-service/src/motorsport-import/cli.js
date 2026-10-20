// 공식 일정 수집 CLI. board 컨테이너 안에서 board와 같은 DB 설정(PG* 환경변수)으로 실행한다.
//
//   node src/motorsport-import/cli.js --source f1               # dry-run(반영하지 않고 결과만 출력)
//   node src/motorsport-import/cli.js --source f1,inje --apply  # 반영. MOTORSPORT_IMPORT_USER_ID 필요
//   node src/motorsport-import/cli.js --source all --no-db      # DB 없이 출처 해석 결과만 출력
//   node src/motorsport-import/cli.js --apply                   # MOTORSPORT_IMPORT_SOURCES에 활성화한 출처만
//
// 출처는 명시해야만 실행한다(--source 또는 MOTORSPORT_IMPORT_SOURCES). 둘 다 비어 있으면 아무것도 하지 않는다 —
// 이용 조건을 확인하지 않은 출처가 스케줄로 실행되지 않게.
// 종료 코드: 모든 출처가 성공하면 0, 하나라도 실패(요청·해석 오류)하면 1 — 스케줄러가 실패 메일을 보낸다.
import pg from "pg";
import { poolConfig } from "../db-pool.js";
import { kstToday } from "../motorsport.js";
import { politeFetcher } from "./common.js";
import { SOURCES, runSource } from "./run.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const requested = (option("--source") ?? process.env.MOTORSPORT_IMPORT_SOURCES ?? "").trim();
const sources = requested === "all" ? Object.keys(SOURCES) : requested.split(",").map((s) => s.trim()).filter(Boolean);
const unknown = sources.filter((s) => !SOURCES[s]);
if (unknown.length) {
  console.error(`알 수 없는 출처: ${unknown.join(", ")} (가능: ${Object.keys(SOURCES).join(", ")})`);
  process.exit(1);
}
if (!sources.length) {
  console.log(JSON.stringify({ started: new Date().toISOString(), skipped: true, reason: "활성화된 출처 없음(MOTORSPORT_IMPORT_SOURCES)" }));
  process.exit(0);
}
const today = kstToday();
let failed = false;

if (flag("--no-db")) {
  for (const source of sources) {
    const { items, errors } = await SOURCES[source].module.collect({ fetchText: politeFetcher(), today });
    console.log(JSON.stringify({ source, today, collected: items.length, items, errors }, null, 2));
    if (errors.length) failed = true;
  }
} else {
  const apply = flag("--apply");
  const actorId = Number(process.env.MOTORSPORT_IMPORT_USER_ID);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    console.error("MOTORSPORT_IMPORT_USER_ID(수집 전용 MANAGER 계정 id)를 설정해주세요.");
    process.exit(1);
  }
  const db = new pg.Pool({ ...poolConfig(), max: 2 });
  for (const source of sources) {
    const started = new Date().toISOString();
    try {
      const result = await runSource({ db, source, fetchText: politeFetcher(), today, actorId, apply });
      console.log(JSON.stringify({ started, apply, ...result }));
      if (!result.ok) failed = true;
    } catch (error) {
      console.error(JSON.stringify({ started, apply, source, ok: false, fatal: error.message }));
      failed = true;
    }
  }
  await db.end();
}
process.exit(failed ? 1 : 0);
