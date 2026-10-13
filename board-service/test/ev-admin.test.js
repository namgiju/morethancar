import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

// 이 테스트는 실제 PostgreSQL에 접속하지 않는다(spots.test.js/motorsport.test.js와 같은 패턴 —
// createApp에 가짜 db/redis를 주입한다). 그래서 이 테스트는 "실제 DB 트랜잭션·락·CHECK 제약이
// 그대로 동작한다"를 보장하지 않는다 — 그건 MORETHANCAR_EV_TASKS.md STEP 1의 "향후 실행 검증
// 절차"(격리된 일회용 PostgreSQL)가 할 일이고, 여기서는 여전히 미실행이다. 이 테스트가 실제로
// 보장하는 것은 네 가지뿐이다:
//  1. 라우트가 세션 역할과 "현재 DB 역할·계정 상태"를 매 요청 재확인하는지(requireCurrentStaff)
//  2. 입력 검증이 DB 쓰기 전에 거부하는지, 그리고 상태 전환 규칙(미검증·출처 없음·이미 공개된
//     버전 수정 등)을 라우트 핸들러가 실제로 거부하는지
//  3. 성공 시 content_admin_logs INSERT + COMMIT이 일어나고, 실패 시 ROLLBACK만 일어나는지
//  4. 공개/삭제 작업이 보내는 SQL 자체에 publication/deleted_at을 바꾸는 구문이 들어있는지(문자열 검사)

const sessions = {
  u: { id: 7, username: "member", role: "USER" },
  m: { id: 5, username: "manager", role: "MANAGER" },
  a: { id: 1, username: "admin", role: "ADMIN" },
  x: { id: 6, username: "ex-manager", role: "MANAGER" }, // 세션 MANAGER, DB는 USER로 강등됨
  y: { id: 3, username: "admin-to-manager", role: "ADMIN" }, // 세션 ADMIN, DB는 MANAGER로 강등됨
  s: { id: 8, username: "suspended-manager", role: "MANAGER" }, // DB 역할은 MANAGER지만 정지 중
};
const dbUsers = {
  7: { role: "USER", status: "ACTIVE", suspended_until: null },
  5: { role: "MANAGER", status: "ACTIVE", suspended_until: null },
  1: { role: "ADMIN", status: "ACTIVE", suspended_until: null },
  6: { role: "USER", status: "ACTIVE", suspended_until: null },
  3: { role: "MANAGER", status: "ACTIVE", suspended_until: null },
  8: { role: "MANAGER", status: "SUSPENDED", suspended_until: "2099-01-01T00:00:00.000Z" },
};

function fakeDb(handlers = []) {
  const log = [];
  const calls = { commit: 0, rollback: 0 };
  const run = (sql, values = []) => {
    log.push({ sql, values });
    // app.js의 공용 세션 재확인 미들웨어가 쓰는 쿼리 — SUSPENDED 계정은 여기서 이미 req.user를
    // null로 만들어 401로 막힌다(역할 검사까지 가지 않음). 실제 PostgreSQL로 재현해 확인했다
    // (STEP 7 사후 검토) — dbUsers를 반영하지 않고 항상 ACTIVE를 반환하던 이전 버전은 이 차이를
    // 가려서 "suspended도 403"이라고 잘못 단정하게 했다.
    if (sql.startsWith("SELECT COALESCE(auth_version")) {
      const user = dbUsers[values[0]];
      return { rows: [{ version: 0, status: user?.status ?? "ACTIVE", suspended_until: user?.suspended_until ?? null }] };
    }
    if (sql.startsWith("SELECT id,username,role")) {
      const user = dbUsers[values[0]];
      return { rows: user ? [{ id: values[0], username: "db-user", ...user }] : [] };
    }
    if (sql === "BEGIN") return {};
    if (sql === "COMMIT") { calls.commit++; return {}; }
    if (sql === "ROLLBACK") { calls.rollback++; return {}; }
    for (const [match, respond] of handlers) {
      if (match(sql)) return respond(sql, values);
    }
    if (sql.includes("SELECT (SELECT count(*)::int FROM filtered)")) return { rows: [{ total: 0, items: [] }] };
    return { rows: [], rowCount: 0 };
  };
  return {
    log,
    calls,
    query: async (sql, values) => run(sql, values),
    connect: async () => ({ query: async (sql, values) => run(sql, values), release: () => {} }),
  };
}

async function start(t, db) {
  const app = createApp({ db, redis: { get: async (key) => JSON.stringify(sessions[key.at(-1)]) } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return (who, path, method = "GET", body) =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(who ? { Cookie: `REVCC_SESSION=${who.repeat(43)}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

const writes = (db) => db.log.filter(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql.trim()));
const logInserts = (db) => writes(db).filter(({ sql }) => sql.includes("INTO content_admin_logs"));

// --- 가짜 DB 응답 조립 헬퍼 ---

const lockPolicyHandler = (overrides = {}) => [
  (sql) => sql.includes("FROM policy_items t WHERE t.id=$1"),
  () => ({ rows: [{ row: { id: 1, deleted_at: null, publication: "DRAFT", updated_at: "2026-01-01T00:00:00.000Z", ...overrides } }] }),
];
const policyNotFoundHandler = [(sql) => sql.includes("FROM policy_items t WHERE t.id=$1"), () => ({ rows: [] })];

const lockVersionHandler = (overrides = {}) => [
  (sql) => sql.includes("FROM policy_versions t WHERE t.id=$1"),
  () => ({
    rows: [{
      row: {
        id: 10, policy_id: 1, revision_kind: "CHANGE", status: "PROPOSED", change_confirmed: false,
        verification_status: "UNVERIFIED", publication: "DRAFT", published_at: null, is_current: false,
        cancelled_at: null, effective_date: null, updated_at: "2026-01-01T00:00:00.000Z", ...overrides,
      },
    }],
  }),
];

const sourceCountHandler = (n) => [(sql) => sql.includes("FROM policy_sources WHERE policy_version_id=$1"), () => ({ rows: [{ n }] })];
// promote는 버전 행을 잠그기 전에 (1) policy_id를 조회하고 (2) 정책 부모 행을 FOR UPDATE로
// 잠근다(동시성 수정, 아래 "promote serializes..." 테스트 참고) — 그 두 쿼리에 대한 응답.
const versionPolicyIdHandler = (policyId = 1) => [(sql) => sql.startsWith("SELECT policy_id FROM policy_versions WHERE id=$1"), () => ({ rows: [{ policy_id: policyId }] })];
const lockPolicyRowHandler = [(sql) => sql.includes("FROM policy_items WHERE id=$1 FOR UPDATE"), () => ({ rows: [{ id: 1 }] })];
const promoteHandlers = (overrides = {}) => [versionPolicyIdHandler(), lockPolicyRowHandler, lockVersionHandler(overrides)];
const supersedesOkHandler = [(sql) => sql.includes("FROM policy_versions WHERE id=$1 AND policy_id=$2"), () => ({ rows: [{ id: 5 }] })];
const supersedesMissingHandler = [(sql) => sql.includes("FROM policy_versions WHERE id=$1 AND policy_id=$2"), () => ({ rows: [] })];
const nextVersionNoHandler = (next) => [(sql) => sql.includes("COALESCE(MAX(version_no),0)+1"), () => ({ rows: [{ next }] })];
const insertReturningIdHandler = (table, id) => [(sql) => sql.startsWith(`INSERT INTO ${table}`) && sql.includes("RETURNING id"), () => ({ rows: [{ id }] })];

// expectedUpdatedAt은 PUT(수정)에서만 쓰이지만(POST 생성은 checkConcurrency를 거치지 않아
// 무시된다), lockVersionHandler()의 기본 updated_at과 맞춰 둬서 PUT 테스트도 그대로 쓸 수 있게 한다.
const validVersionBody = (overrides = {}) => ({
  revisionKind: "CHANGE",
  supersedesVersionId: 5,
  changeSummary: "지원 금액 조정",
  summary: "요약", keyPoints: "핵심", target: "대상", benefit: "혜택", howToApply: "신청 방법",
  status: "PROPOSED",
  expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

// --- 1. MANAGER 허용, USER/비로그인/강등·정지 계정 거부 ---

const contentReads = ["/api/board/admin/ev/policies", "/api/board/admin/ev/logs", "/api/board/admin/ev/stale"];
const contentWrites = [
  ["/api/board/admin/ev/policies", "POST"],
  ["/api/board/admin/ev/policies/1", "PUT"],
  ["/api/board/admin/ev/policies/1/publish", "POST"],
  ["/api/board/admin/ev/policies/1/hide", "POST"],
  ["/api/board/admin/ev/policies/1/versions", "POST"],
  ["/api/board/admin/ev/versions/1", "PUT"],
  ["/api/board/admin/ev/versions/1/sources", "POST"],
  ["/api/board/admin/ev/versions/1/publish", "POST"],
  ["/api/board/admin/ev/versions/1/hide", "POST"],
  ["/api/board/admin/ev/versions/1/verify", "POST"],
  ["/api/board/admin/ev/versions/1/verify-confirm", "POST"],
  ["/api/board/admin/ev/versions/1/promote", "POST"],
  ["/api/board/admin/ev/versions/1/cancel", "POST"],
];
const adminOnlyWrites = [
  ["/api/board/admin/ev/policies/1", "DELETE"],
  ["/api/board/admin/ev/policies/1/restore", "POST"],
];

test("ev admin API: anonymous 401, USER/demoted-role 403, suspended session 401 (session invalidated before role check), MANAGER/ADMIN allowed for reads", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  for (const path of contentReads) {
    assert.equal((await request(null, path)).status, 401, path);
    for (const who of ["u", "x"]) assert.equal((await request(who, path)).status, 403, `${who} ${path}`);
    // SUSPENDED는 app.js의 공용 세션 재확인 미들웨어가 req.user를 먼저 null로 만들어 401이다
    // (requireCurrentStaff의 403까지 가지 않는다) — 실제 PostgreSQL로 확인함(STEP 7 사후 검토).
    assert.equal((await request("s", path)).status, 401, `s ${path}`);
  }
  for (const [path, method] of [...contentWrites, ...adminOnlyWrites]) {
    assert.equal((await request(null, path, method, {})).status, 401, `${method} ${path}`);
    for (const who of ["u", "x"]) assert.equal((await request(who, path, method, {})).status, 403, `${who} ${method} ${path}`);
    assert.equal((await request("s", path, method, {})).status, 401, `s ${method} ${path}`);
  }
  assert.equal(writes(db).length, 0, "no write happened for any denied request");
  for (const who of ["m", "a", "y"])
    for (const path of contentReads) assert.equal((await request(who, path)).status, 200, `${who} ${path}`);
});

// --- 2. 삭제·복원 ADMIN 전용 ---

test("MANAGER cannot delete/restore policies; ADMIN can", async (t) => {
  const db = fakeDb([lockPolicyHandler()]);
  const request = await start(t, db);
  for (const who of ["m", "y"]) {
    for (const [path, method] of adminOnlyWrites)
      assert.equal((await request(who, path, method, {})).status, 403, `${who} ${method} ${path}`);
  }
  assert.equal(writes(db).length, 0);
  assert.equal((await request("a", "/api/board/admin/ev/policies/1", "DELETE", {})).status, 204);
  assert.ok(writes(db).some(({ sql }) => sql.includes("deleted_at=NOW()")));
});

// --- 3. 변경 요약 누락 거부 ---

test("POST .../policies/:id/versions rejects a missing or blank changeSummary before any version row is written", async (t) => {
  for (const changeSummary of [undefined, "", "   "]) {
    const db = fakeDb([lockPolicyHandler(), supersedesOkHandler]);
    const request = await start(t, db);
    const body = validVersionBody({ changeSummary });
    const res = await request("m", "/api/board/admin/ev/policies/1/versions", "POST", body);
    assert.equal(res.status, 400, JSON.stringify(changeSummary));
  }
  // INITIAL(정책 생성)은 changeSummary가 필요 없다 — 같은 엔드포인트가 아니라 POST /policies가 담당.
});

// --- 4. 미검증·출처 없는 버전 공개 거부 ---

test("POST .../versions/:id/publish rejects when unverified, and separately when it has no sources", async (t) => {
  {
    const db = fakeDb([lockVersionHandler({ verification_status: "UNVERIFIED" }), lockPolicyHandler(), sourceCountHandler(1)]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1/publish", "POST", {});
    assert.equal(res.status, 409);
    assert.match((await res.json()).message, /검증/);
  }
  {
    const db = fakeDb([lockVersionHandler({ verification_status: "VERIFIED" }), lockPolicyHandler(), sourceCountHandler(0)]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1/publish", "POST", {});
    assert.equal(res.status, 409);
    assert.match((await res.json()).message, /출처/);
  }
  {
    // 둘 다 충족하면 공개된다.
    const db = fakeDb([lockVersionHandler({ verification_status: "VERIFIED", status: "PROPOSED" }), lockPolicyHandler(), sourceCountHandler(1)]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1/publish", "POST", {});
    assert.equal(res.status, 200);
    assert.ok(writes(db).some(({ sql }) => sql.includes("SET publication='PUBLISHED'")));
  }
});

// --- 5. 공개 이력이 있는 본문·출처 직접 수정 거부 ---

test("already-published-once versions reject direct content edits and new sources", async (t) => {
  const published = { published_at: "2026-01-01T00:00:00.000Z" };
  {
    const db = fakeDb([lockVersionHandler(published)]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1", "PUT", validVersionBody());
    assert.equal(res.status, 409);
  }
  {
    const db = fakeDb([lockVersionHandler(published)]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1/sources", "POST", {
      publisher: "환경부", title: "공고", url: "https://me.go.kr/x",
    });
    assert.equal(res.status, 409);
    assert.equal(writes(db).some(({ sql }) => sql.startsWith("INSERT INTO policy_sources")), false);
  }
  // 반대로 한 번도 공개되지 않은 버전은 둘 다 허용된다.
  {
    const db = fakeDb([lockVersionHandler({ published_at: null })]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1", "PUT", validVersionBody());
    assert.equal(res.status, 200);
  }
});

// --- 5-1. 검증 선언은 상태 선택·날짜 입력이 아니라 명시적 confirmVerification + 근거(출처)로만 ---
// (사후 검토에서 발견한 결함 수정: 이전에는 PROPOSED가 아닌 상태를 고르면 verifiedOn이 없어도
// 서버가 오늘 날짜로 채우고 VERIFIED로 저장했다 — 사용자가 실제로 확인한 적이 없어도.)

test("a confirmed (non-PROPOSED) status without an explicit confirmVerification flag is rejected before any write", async (t) => {
  const db = fakeDb([lockPolicyHandler(), supersedesOkHandler]);
  const request = await start(t, db);
  const res = await request("m", "/api/board/admin/ev/policies/1/versions", "POST", validVersionBody({ status: "ACTIVE", effectiveDate: "2026-01-01" }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /명시적으로 확인/);
  assert.equal(writes(db).length, 0);
});

test("confirmVerification:true without any source (inline or existing) is rejected — a verification claim needs grounds", async (t) => {
  const db = fakeDb([lockPolicyHandler(), supersedesOkHandler, nextVersionNoHandler(2)]);
  const request = await start(t, db);
  const res = await request(
    "m",
    "/api/board/admin/ev/policies/1/versions",
    "POST",
    validVersionBody({ status: "ACTIVE", effectiveDate: "2026-01-01", confirmVerification: true }),
  );
  assert.equal(res.status, 409);
  assert.match((await res.json()).message, /출처/);
  assert.equal(writes(db).some(({ sql }) => sql.startsWith("INSERT INTO policy_versions")), false);
});

test("confirmVerification:true with an inline source succeeds and inserts both the version and the source in one transaction", async (t) => {
  const db = fakeDb([
    lockPolicyHandler(),
    supersedesOkHandler,
    nextVersionNoHandler(2),
    insertReturningIdHandler("policy_versions", 77),
    [(sql) => sql.includes("FROM policy_versions t WHERE t.id=$1"), () => ({ rows: [{ row: { id: 77, policy_id: 1 } }] })],
  ]);
  const request = await start(t, db);
  const res = await request(
    "m",
    "/api/board/admin/ev/policies/1/versions",
    "POST",
    validVersionBody({
      status: "ACTIVE",
      effectiveDate: "2026-01-01",
      confirmVerification: true,
      sources: [{ publisher: "환경부", title: "공고", url: "https://me.go.kr/x" }],
    }),
  );
  assert.equal(res.status, 201, await res.text());
  assert.ok(writes(db).some(({ sql }) => sql.startsWith("INSERT INTO policy_versions")));
  const sourceWrite = writes(db).find(({ sql }) => sql.startsWith("INSERT INTO policy_sources"));
  assert.ok(sourceWrite, "source row must be inserted alongside the version");
  assert.equal(sourceWrite.values[0], 77, "source must reference the newly created version id");
});

test("editing a draft to a confirmed status with confirmVerification:true may rely on sources already stored for that version", async (t) => {
  const db = fakeDb([lockVersionHandler({ published_at: null }), sourceCountHandler(1)]);
  const request = await start(t, db);
  const res = await request(
    "m",
    "/api/board/admin/ev/versions/1",
    "PUT",
    validVersionBody({ status: "ACTIVE", effectiveDate: "2026-01-01", confirmVerification: true }),
  );
  assert.equal(res.status, 200, await res.text());
});

test("editing a draft to a confirmed status with confirmVerification:true is rejected when neither inline nor existing sources exist", async (t) => {
  const db = fakeDb([lockVersionHandler({ published_at: null }), sourceCountHandler(0)]);
  const request = await start(t, db);
  const res = await request(
    "m",
    "/api/board/admin/ev/versions/1",
    "PUT",
    validVersionBody({ status: "ACTIVE", effectiveDate: "2026-01-01", confirmVerification: true }),
  );
  assert.equal(res.status, 409);
  assert.equal(writes(db).some(({ sql }) => sql.startsWith("UPDATE policy_versions SET summary")), false);
});

// --- 6. 다른 정책 버전 참조·잘못된 승격·취소 거부 ---

test("version creation rejects a supersedesVersionId from a different policy before INSERT", async (t) => {
  const db = fakeDb([lockPolicyHandler(), supersedesMissingHandler]);
  const request = await start(t, db);
  const res = await request("m", "/api/board/admin/ev/policies/1/versions", "POST", validVersionBody());
  assert.equal(res.status, 400);
  assert.equal(writes(db).some(({ sql }) => sql.startsWith("INSERT INTO policy_versions")), false);
});

test("promote rejects a non-published, cancelled, or already-current version", async (t) => {
  for (const overrides of [{ publication: "DRAFT" }, { publication: "PUBLISHED", cancelled_at: "2026-01-01T00:00:00.000Z" }, { publication: "PUBLISHED", is_current: true }]) {
    const db = fakeDb(promoteHandlers(overrides));
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1/promote", "POST", {});
    assert.equal(res.status, 409, JSON.stringify(overrides));
  }
});

test("promote 404s when the version id doesn't exist, before attempting any lock", async (t) => {
  const db = fakeDb([]);
  const request = await start(t, db);
  const res = await request("m", "/api/board/admin/ev/versions/999/promote", "POST", {});
  assert.equal(res.status, 404);
  assert.equal(writes(db).length, 0);
});

// --- 6-1. 승격 동시성: 정책 부모 행을 먼저 잠근 뒤에만 버전 행을 잠그는지(일관된 락 순서) ---
// 실제 PostgreSQL 동시 요청으로 경쟁을 재현하는 것은 아니다(그건 미완료로 남겨 둔 실DB 검증의
// 몫이다) — 여기서는 핸들러가 보내는 SQL의 "순서" 자체가 정책 부모 행을 먼저 잠그도록 바뀌었는지만
// 문자열로 확인한다. 이 순서가 §4 설명대로 "버전 등록과 같은 순서"라는 점이 동시 승격·동시 등록이
// 서로를 기다리기만 하고(교착 없이) 경쟁하지 않게 하는 근거다.
test("promote locks the parent policy row before touching the version row (same order as version creation)", async (t) => {
  const db = fakeDb(promoteHandlers({ publication: "PUBLISHED" }));
  const request = await start(t, db);
  const res = await request("m", "/api/board/admin/ev/versions/1/promote", "POST", {});
  assert.equal(res.status, 200, await res.text());
  // The two queries right after BEGIN must be, in this exact order, "which policy does this
  // version belong to" and then "lock that policy row" — before the version row itself is touched.
  const beginAt = db.log.findIndex(({ sql }) => sql === "BEGIN");
  assert.ok(beginAt >= 0);
  assert.match(db.log[beginAt + 1].sql, /SELECT policy_id FROM policy_versions WHERE id=\$1/);
  assert.match(db.log[beginAt + 2].sql, /FROM policy_items WHERE id=\$1 FOR UPDATE/);
});

test("cancel rejects the current representative version and an already-cancelled version", async (t) => {
  for (const overrides of [{ is_current: true }, { cancelled_at: "2026-01-01T00:00:00.000Z" }]) {
    const db = fakeDb([lockVersionHandler(overrides)]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1/cancel", "POST", { cancellationNote: "입법예고 철회" });
    assert.equal(res.status, 409, JSON.stringify(overrides));
  }
});

// --- 7. 정책 전체 비공개·삭제 후 공개 API 노출 차단 (SQL 자체에 게이트가 들어있는지) ---
// 공개 API(evRouter)가 policy_items.publication='PUBLISHED' AND deleted_at IS NULL을 항상 거는 것은
// ev.test.js가 이미 확인했다 — 여기서는 관리자 작업이 그 게이트 컬럼 자체를 실제로 바꾸는지만 본다.

test("policy hide/delete send SQL that actually flips the columns the public gate checks", async (t) => {
  {
    const db = fakeDb([lockPolicyHandler({ publication: "PUBLISHED" })]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/policies/1/hide", "POST", {});
    assert.equal(res.status, 200);
    const write = writes(db).find(({ sql }) => sql.includes("UPDATE policy_items") && sql.includes("publication=$2"));
    assert.ok(write);
    // $2는 이 쿼리에서 두 번 쓰인다(publication=$2, CASE WHEN $2=...) — 실제 PostgreSQL에서는 둘
    // 다 ::text로 캐스트하지 않으면 "inconsistent types deduced for parameter $2"로 503이 난다
    // (STEP 7 사후 검토에서 실제 DB로 재현해 발견한 결함, 지금은 고쳤다). mock DB는 SQL을 실행하지
    // 않아 이 종류의 오류를 스스로 잡지 못하므로, 캐스트가 계속 남아 있는지 문자열로 고정해 둔다.
    assert.equal((write.sql.match(/\$2::text/g) ?? []).length, 2, write.sql);
  }
  {
    const db = fakeDb([lockPolicyHandler()]);
    const request = await start(t, db);
    const res = await request("a", "/api/board/admin/ev/policies/1", "DELETE", {});
    assert.equal(res.status, 204);
    assert.ok(writes(db).some(({ sql }) => sql.includes("UPDATE policy_items") && sql.includes("deleted_at=NOW()")));
  }
});

// --- 8. 정상 작업의 감사 로그 기록 및 실패 시 롤백 ---

test("a successful write logs to content_admin_logs and commits; a constraint failure rolls back and logs nothing", async (t) => {
  {
    const db = fakeDb([lockVersionHandler(), sourceCountHandler(1)]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1/verify-confirm", "POST", {});
    assert.equal(res.status, 200);
    assert.equal(logInserts(db).length, 1);
    assert.equal(db.calls.commit, 1);
    assert.equal(db.calls.rollback, 0);
  }
  {
    // CHECK 위반을 흉내낸다(DB가 거부하는 조합) — UPDATE 시점에 에러를 던진다.
    const db = fakeDb([
      lockVersionHandler(),
      sourceCountHandler(1),
      [(sql) => sql.startsWith("UPDATE policy_versions SET verification_status='VERIFIED'"), () => {
        throw Object.assign(new Error("check violation"), { code: "23514" });
      }],
    ]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/versions/1/verify-confirm", "POST", {});
    assert.equal(res.status, 400);
    assert.equal(logInserts(db).length, 0, "no audit log entry on a rolled-back failure");
    assert.equal(db.calls.commit, 0);
    assert.equal(db.calls.rollback, 1);
  }
});

// --- 9. 동시 편집 충돌 처리 ---

test("PUT /policies/:id detects a stale edit via expectedUpdatedAt and rejects it with 409, independent of string formatting", async (t) => {
  const updatedAt = "2026-01-01T00:00:00.000Z";
  const body = { category: "BUY", scope: "NATIONAL", title: "제목" };
  {
    const db = fakeDb([lockPolicyHandler({ updated_at: updatedAt })]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/policies/1", "PUT", { ...body, expectedUpdatedAt: "2025-01-01T00:00:00.000Z" });
    assert.equal(res.status, 409);
  }
  {
    // Postgres의 row_to_json은 +00:00 오프셋으로 직렬화할 수 있다 — 문자열이 달라도 같은 순간이면 통과해야 한다.
    const db = fakeDb([lockPolicyHandler({ updated_at: "2026-01-01T00:00:00+00:00" })]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/policies/1", "PUT", { ...body, expectedUpdatedAt: "2026-01-01T00:00:00.000Z" });
    assert.equal(res.status, 200);
  }
  {
    // expectedUpdatedAt을 아예 보내지 않으면(키 자체가 없으면) 충돌 보호를 우회할 수 없다 —
    // 400으로 거부한다(STEP 7 사후 검토에서 발견한 결함 수정: 이전에는 이 경우 검사를 그냥 건너뛰었다).
    const db = fakeDb([lockPolicyHandler({ updated_at: updatedAt })]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/policies/1", "PUT", body);
    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /expectedUpdatedAt/);
  }
  {
    // 한 번도 수정된 적 없는 행(updated_at=null)은 expectedUpdatedAt:null을 명시적으로 보내야 한다.
    const db = fakeDb([lockPolicyHandler({ updated_at: null })]);
    const request = await start(t, db);
    const res = await request("m", "/api/board/admin/ev/policies/1", "PUT", { ...body, expectedUpdatedAt: null });
    assert.equal(res.status, 200);
  }
});

// --- 10. 등록·공개 흐름이 끝까지 성공하는지(모든 가짜 응답이 맞물려 있는지 확인) ---

test("creating a policy inserts both policy_items and the INITIAL policy_versions row in one transaction", async (t) => {
  const db = fakeDb([
    insertReturningIdHandler("policy_items", 42),
    insertReturningIdHandler("policy_versions", 99),
    lockPolicyHandler(),
    [(sql) => sql.includes("FROM policy_items p WHERE p.id=$1"), () => ({ rows: [{ id: 42, slug: "ev-subsidy-2026" }] })],
  ]);
  const request = await start(t, db);
  const res = await request("m", "/api/board/admin/ev/policies", "POST", {
    slug: "ev-subsidy-2026", category: "BUY", scope: "NATIONAL", title: "2026 보조금",
    summary: "요약", keyPoints: "핵심", target: "대상", benefit: "혜택", howToApply: "신청 방법",
    status: "PROPOSED",
  });
  assert.equal(res.status, 201, await res.text());
  assert.ok(writes(db).some(({ sql }) => sql.startsWith("INSERT INTO policy_items")));
  assert.ok(writes(db).some(({ sql }) => sql.startsWith("INSERT INTO policy_versions") && sql.includes("'INITIAL'")));
  assert.equal(logInserts(db).length, 1);
});
