// 출처 하나를 수집해 반영하고 실행 기록을 남긴다. CLI(cli.js)와 시스템 테스트가 쓴다.
//
//  - 동시 실행: 출처별 advisory lock. 이미 실행 중이면 아무것도 하지 않고 끝낸다(skipped).
//  - 재실행: source_key 유일 인덱스 + 항목별 트랜잭션이라 같은 항목을 여러 번 반영해도 행이 늘지 않는다.
//  - dry-run(apply=false): 실제 반영과 같은 코드를 항목별 트랜잭션에서 실행하고 ROLLBACK한다. 실행 기록도 남기지 않는다.
//  - 결과 ok=false: 출처 요청 실패·해석 실패가 하나라도 있으면. 해석된 항목은 그대로 반영한다.
import { applyItem } from "./sync.js";
import * as f1 from "./sources/f1.js";
import * as inje from "./sources/inje.js";
import * as lemans from "./sources/lemans.js";
import * as nascar from "./sources/nascar.js";
import * as superrace from "./sources/superrace.js";

// prefix: 이 출처가 만드는 source_key 접두어(사라진 일정 보고와 지난 경기 페이지 생략에 쓴다).
// WRC는 공식 사이트(wrc.com)가 이 환경의 요청을 403으로 막아 아직 넣지 않았다(docs/plans 참고).
export const SOURCES = {
  f1: { prefix: "f1", module: f1 },
  nascar: { prefix: "nascar", module: nascar },
  lemans: { prefix: "le-mans-24h", module: lemans },
  superrace: { prefix: "superrace", module: superrace },
  inje: { prefix: "inje", module: inje },
};

async function actorOf(client, actorId) {
  const { rows } = await client.query(
    "SELECT id,role FROM users WHERE id=$1 AND role IN ('MANAGER','ADMIN') AND COALESCE(account_status,'ACTIVE')='ACTIVE'",
    [actorId],
  );
  if (!rows.length) throw new Error("MOTORSPORT_IMPORT_USER_ID가 활성 MANAGER/ADMIN 계정이 아닙니다.");
  return { id: Number(rows[0].id), role: rows[0].role };
}

export async function runSource({ db, source, fetchText, today, actorId, apply = false }) {
  const { prefix, module } = SOURCES[source] ?? {};
  if (!module) throw new Error(`알 수 없는 출처: ${source}`);
  const client = await db.connect();
  let runId = null;
  try {
    const lockKey = `motorsport-import:${source}`;
    if (apply && !(await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS ok", [lockKey])).rows[0].ok)
      return { source, skipped: true, ok: true };
    try {
      // 실행 기록을 먼저 만든다: 계정 설정 오류도 실패 기록으로 관리자 화면에 보이게.
      if (apply) runId = (await client.query("INSERT INTO motorsport_import_runs(source) VALUES($1) RETURNING id", [source])).rows[0].id;
      const actor = await actorOf(client, actorId);

      const past = await client.query(
        "SELECT source_url FROM motorsport_events WHERE source_key LIKE $1 AND ends_on < $2::date",
        [`${prefix}:%`, today],
      );
      const { items, errors } = await module.collect({ fetchText, today, skipUrls: new Set(past.rows.map((r) => r.source_url)) });

      const counts = { inserted: 0, updated: 0, conflict: 0, unchanged: 0, deleted: 0 };
      const details = [];
      for (const item of items) {
        try {
          await client.query("BEGIN");
          const outcome = await applyItem(client, item, { actor, today });
          await client.query(apply ? "COMMIT" : "ROLLBACK");
          counts[outcome.result]++;
          if (outcome.result !== "unchanged") details.push({ key: item.key, title: item.title, startsOn: item.startsOn, ...outcome });
        } catch (error) {
          await client.query("ROLLBACK");
          errors.push(`${item.key}: ${error.message}`);
        }
      }
      // 출처에서 사라진 앞으로의 일정: 삭제·취소하지 않고 보고만 한다. 수집 자체가 실패했으면 판단하지 않는다.
      let missing = [];
      if (!errors.length) {
        const keys = items.map((i) => i.key);
        missing = (await client.query(
          `SELECT id,source_key AS key,title,to_char(starts_on,'YYYY-MM-DD') AS "startsOn" FROM motorsport_events
           WHERE source_key LIKE $1 AND deleted_at IS NULL AND ends_on >= $2::date AND NOT (source_key = ANY($3::text[]))
           ORDER BY starts_on`,
          [`${prefix}:%`, today, keys],
        )).rows;
      }
      const summary = { ...counts, collected: items.length, missing, errors, details };
      const ok = errors.length === 0;
      if (runId)
        await client.query(
          "UPDATE motorsport_import_runs SET finished_at=NOW(),ok=$2,summary=$3::jsonb,error=$4 WHERE id=$1",
          [runId, ok, JSON.stringify({ ...counts, collected: items.length, missing: missing.length, errors: errors.length }),
            ok ? null : errors.join(" | ").slice(0, 1000)],
        );
      return { source, ok, ...summary };
    } finally {
      if (apply) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
    }
  } catch (error) {
    if (runId)
      await client.query("UPDATE motorsport_import_runs SET finished_at=NOW(),ok=false,error=$2 WHERE id=$1", [runId, error.message.slice(0, 1000)]);
    throw error;
  } finally {
    client.release();
  }
}
