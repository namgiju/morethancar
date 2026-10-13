import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import {
  attachSourcesAndPrevious,
  changesWindow,
  publicSource,
  publicVersion,
  slugParam,
} from "../src/ev.js";

// 이 테스트는 실제 PostgreSQL에 접속하지 않는다(spots.test.js/motorsport.test.js와 같은 패턴 —
// createApp에 가짜 db/redis를 주입한다). 그래서 CHECK 제약·FK·실제 WHERE 절 평가 같은 DB 레벨
// 보장은 이 테스트로 "검증됐다"고 주장하지 않는다 — 그건 MORETHANCAR_EV_TASKS.md STEP 1의
// "향후 실행 검증 절차"(격리된 일회용 PostgreSQL)가 할 일이고, 여기서는 여전히 미실행이다.
// 이 테스트가 실제로 보장하는 것은 세 가지뿐이다:
//  1. 라우트가 DB를 두드리기 전에 입력을 거부하는지(검증 함수 자체의 정확성)
//  2. 공개 DTO를 만드는 순수 함수(publicVersion/publicSource/attachSourcesAndPrevious)가
//     내부 id를 빼고, 비공개 이전 버전을 숨기고, 취소된 버전을 올바르게 분류하는지
//  3. 라우트가 DB로 보내는 SQL 문자열 자체에 공개 게이트·날짜 직렬화 방식이 들어있는지(문자열 검사,
//     spots.test.js의 touchesSpots와 같은 성격 — SQL이 실제로 그 조건대로 "동작"하는지는 못 본다)

function fakeDb(handlers = []) {
  const log = [];
  const run = (sql, values = []) => {
    log.push({ sql, values });
    for (const [match, respond] of handlers) {
      if (match(sql)) return respond(sql, values);
    }
    return { rows: [] };
  };
  return { log, query: async (sql, values) => run(sql, values) };
}

async function start(t, db) {
  const app = createApp({ db, redis: { get: async () => null } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return (path) => fetch(base + path);
}

const touchesEv = (db) => db.log.some(({ sql }) => /policy_items|policy_versions|policy_sources/.test(sql));

// --- 1. 입력 검증이 DB 접근 전에 끝나는지 ---

test("GET /api/board/ev/policies rejects invalid filters before touching the DB", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  for (const query of ["category=BIKE", "status=DONE", "featured=1", "limit=201", "limit=0"]) {
    assert.equal((await request(`/api/board/ev/policies?${query}`)).status, 400, query);
  }
  assert.equal(touchesEv(db), false);
});

test("GET /api/board/ev/policies accepts valid filters", async (t) => {
  const db = fakeDb([[(sql) => sql.includes("FROM policy_items p JOIN policy_versions v"), () => ({ rows: [] })]]);
  const request = await start(t, db);
  for (const query of ["", "?category=BUY", "?status=PROPOSED", "?featured=true", "?q=보조금", "?limit=10"]) {
    assert.equal((await request(`/api/board/ev/policies${query}`)).status, 200, query);
  }
});

test("GET /api/board/ev/policies/:slug rejects a malformed slug before touching the DB", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  // "ends-"처럼 끝이 하이픈인 slug는 V8 CHECK(`^[a-z0-9][a-z0-9-]*$`)가 실제로 허용한다
  // (하이픈 반복·끝 하이픈을 막지 않음) — 금지 목록에 넣지 않는다, 아래 valid 테스트에서 확인.
  // ""는 여기서 테스트하지 않는다 — 빈 :slug 세그먼트는 라우팅 자체가 안 되어 /policies로 빠진다
  // (slugParam("") 자체가 400을 던지는지는 아래 "slugParam matches..." 단위 테스트가 직접 확인한다).
  for (const slug of ["Not-Lower", "has space", "-leading-dash", "a".repeat(81)]) {
    assert.equal((await request(`/api/board/ev/policies/${encodeURIComponent(slug)}`)).status, 400, slug);
  }
  assert.equal(touchesEv(db), false);
});

test("GET /api/board/ev/changes rejects an invalid filter or oversized limit before touching the DB", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  for (const query of ["filter=urgent", "limit=500"]) {
    assert.equal((await request(`/api/board/ev/changes?${query}`)).status, 400, query);
  }
  assert.equal(touchesEv(db), false);
});

// --- 2. 없음/비공개/삭제가 모두 같은 404인지 ---

test("GET /api/board/ev/policies/:slug returns the same 404 whether the policy is missing, hidden, draft or deleted", async (t) => {
  // 공개 게이트(policy_items.publication='PUBLISHED' AND deleted_at IS NULL)를 만족하지 않으면
  // 쿼리 자체가 행을 돌려주지 않는다 — 가짜 DB에서는 "행 없음"으로 네 경우를 동일하게 흉내낸다.
  const db = fakeDb([[(sql) => sql.includes("FROM policy_items p WHERE p.slug=$1"), () => ({ rows: [] })]]);
  const request = await start(t, db);
  const res = await request("/api/board/ev/policies/does-not-matter");
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.ok(!/DRAFT|HIDDEN|deleted/i.test(body.message ?? ""), "message must not leak why it's hidden");
});

test("GET /api/board/ev/policies/:slug returns 404 when the policy row exists but has no published current version", async (t) => {
  const db = fakeDb([
    [(sql) => sql.includes("FROM policy_items p WHERE p.slug=$1"), () => ({ rows: [{ _id: 1, slug: "x", title: "X", category: "BUY", scope: "NATIONAL", regionNote: null, featured: false }] })],
    [(sql) => sql.includes("FROM policy_versions v WHERE v.policy_id=$1"), () => ({ rows: [] })],
  ]);
  const request = await start(t, db);
  assert.equal((await request("/api/board/ev/policies/x")).status, 404);
});

// --- 3. 현재+미래 공존, 취소 제외 ---

const baseVersionRow = (overrides) => ({
  _id: 1, _supersedesId: null, versionNo: 1, revisionKind: "INITIAL",
  summary: "요약", keyPoints: "핵심", target: "대상", benefit: "혜택", howToApply: "방법", note: null,
  status: "ACTIVE", changeConfirmed: true, announcedOn: null, effectiveDate: "2026-01-01", endDate: null,
  endDateIndefinite: false, lastVerifiedOn: "2026-01-01", changeSummary: null, cancelled: false, cancellationNote: null,
  _isCurrent: true,
  ...overrides,
});

test("GET /api/board/ev/policies/:slug splits the current version from upcoming (non-current, non-cancelled) changes", async (t) => {
  const current = baseVersionRow({ _id: 10, versionNo: 1, _isCurrent: true });
  const upcoming = baseVersionRow({
    _id: 11, _supersedesId: 10, versionNo: 2, revisionKind: "CHANGE", status: "SCHEDULED",
    changeConfirmed: true, effectiveDate: "2026-12-01", _isCurrent: false, changeSummary: "요금 변경",
  });
  const cancelled = baseVersionRow({
    _id: 12, _supersedesId: 10, versionNo: 3, revisionKind: "CHANGE", status: "PROPOSED",
    changeConfirmed: false, effectiveDate: null, _isCurrent: false, cancelled: true,
    cancellationNote: "입법예고 철회", changeSummary: "취소된 변경안",
  });
  const db = fakeDb([
    [(sql) => sql.includes("FROM policy_items p WHERE p.slug=$1"), () => ({ rows: [{ _id: 1, slug: "x", title: "X", category: "BUY", scope: "NATIONAL", regionNote: null, featured: false }] })],
    [(sql) => sql.includes("FROM policy_versions v WHERE v.policy_id=$1"), () => ({ rows: [current, upcoming, cancelled] })],
    [(sql) => sql.includes("FROM policy_sources WHERE policy_version_id"), () => ({ rows: [] })],
    [(sql) => sql.includes('FROM policy_versions WHERE id = ANY'), () => ({ rows: [{ _id: 10, versionNo: 1, summary: "요약", status: "ACTIVE", benefit: "혜택", effectiveDate: "2026-01-01", endDate: null }] })],
    [(sql) => sql.includes("FROM policy_items p2 JOIN policy_versions v2"), () => ({ rows: [] })],
  ]);
  const request = await start(t, db);
  const res = await request("/api/board/ev/policies/x");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.current.versionNo, 1);
  assert.equal(body.upcomingChanges.length, 1, "cancelled change must be excluded from upcomingChanges");
  assert.equal(body.upcomingChanges[0].versionNo, 2);
  assert.equal(body.history.length, 3, "history keeps every published version, cancelled included");
  assert.ok(body.history.some((v) => v.cancelled && v.versionNo === 3));
  // 대체된(이전) 버전이 공개 상태라 비교 정보가 채워진다 — summary뿐 아니라 status/benefit도 비교용으로 내려온다.
  assert.equal(body.upcomingChanges[0].previousVersion.versionNo, 1);
  assert.equal(body.upcomingChanges[0].previousVersion.status, "ACTIVE");
  assert.equal(body.upcomingChanges[0].previousVersion.benefit, "혜택");
});

test("GET /api/board/ev/policies/:slug excludes from upcomingChanges: CORRECTION entries, past ACTIVE/EXPIRED history, and versions already superseded by a newer one (kept in history, not shown as upcoming)", async (t) => {
  const current = baseVersionRow({ _id: 10, versionNo: 1, _isCurrent: true, status: "ACTIVE" });
  // 과거 EXPIRED 이력 — "곧 달라지는 변경"이 아니라 그냥 지나간 역사다.
  const pastExpired = baseVersionRow({ _id: 9, versionNo: 0, _isCurrent: false, status: "EXPIRED", effectiveDate: "2020-01-01" });
  // 오탈자 수정 — 제도 자체가 바뀐 게 아니므로 "곧 달라지는 변경"이 아니다.
  const correction = baseVersionRow({ _id: 11, _supersedesId: 10, versionNo: 2, revisionKind: "CORRECTION", status: "ACTIVE", _isCurrent: false, changeSummary: "오탈자 수정" });
  // 한때는 "살아있는 예정 변경"이었지만 아래 replacement가 등장해 대체된 버전 — 더 이상 upcoming이 아니다.
  const supersededVersion = baseVersionRow({ _id: 12, _supersedesId: 10, versionNo: 3, revisionKind: "CHANGE", status: "SCHEDULED", effectiveDate: "2026-12-01", _isCurrent: false, changeSummary: "요금 변경" });
  const replacement = baseVersionRow({ _id: 13, _supersedesId: 12, versionNo: 4, revisionKind: "CHANGE", status: "SCHEDULED", effectiveDate: "2027-01-01", _isCurrent: false, changeSummary: "요금 재조정" });
  const db = fakeDb([
    [(sql) => sql.includes("FROM policy_items p WHERE p.slug=$1"), () => ({ rows: [{ _id: 1, slug: "x", title: "X", category: "BUY", scope: "NATIONAL", regionNote: null, featured: false }] })],
    [(sql) => sql.includes("FROM policy_versions v WHERE v.policy_id=$1"), () => ({ rows: [pastExpired, current, correction, supersededVersion, replacement] })],
    [(sql) => sql.includes("FROM policy_sources WHERE policy_version_id"), () => ({ rows: [] })],
    [(sql) => sql.includes('FROM policy_versions WHERE id = ANY'), () => ({ rows: [] })],
    [(sql) => sql.includes("FROM policy_items p2 JOIN policy_versions v2"), () => ({ rows: [] })],
  ]);
  const request = await start(t, db);
  const body = await (await request("/api/board/ev/policies/x")).json();
  assert.equal(body.upcomingChanges.length, 1, JSON.stringify(body.upcomingChanges.map((v) => v.versionNo)));
  assert.equal(body.upcomingChanges[0].versionNo, 4, "only the non-superseded SCHEDULED change remains upcoming");
  assert.equal(body.history.length, 5, "history preserves everything, including the superseded and corrected versions");
});

// --- 4. 비공개 이전 버전은 본문·출처를 노출하지 않고 "비교 정보 없음"을 명시 ---

test("attachSourcesAndPrevious hides a non-public superseded version and states so explicitly", async (t) => {
  const changeRow = baseVersionRow({ _id: 20, _supersedesId: 99, versionNo: 2, revisionKind: "CHANGE", _isCurrent: true });
  const db = fakeDb([
    [(sql) => sql.includes("FROM policy_sources WHERE policy_version_id"), () => ({ rows: [] })],
    // supersedes_version_id=99가 가리키는 버전은 더 이상 publication='PUBLISHED'가 아니므로
    // (관리자가 숨김) 이 쿼리가 행을 돌려주지 않는다 — 실제 DB의 "AND publication='PUBLISHED'"
    // 조건이 하는 일을 가짜 DB에서는 "행 없음"으로 흉내낸다.
    [(sql) => sql.includes('FROM policy_versions WHERE id = ANY'), () => ({ rows: [] })],
  ]);
  const [shaped] = await attachSourcesAndPrevious(db, [changeRow]);
  assert.equal(shaped.previousVersion, null);
  assert.equal(shaped.previousVersionNote, "이전 버전의 공개 정보를 확인할 수 없습니다.");
});

test("attachSourcesAndPrevious leaves both previousVersion fields null for an INITIAL version (nothing to compare)", async () => {
  const [shaped] = await attachSourcesAndPrevious(fakeDb(), [baseVersionRow({ revisionKind: "INITIAL" })]);
  assert.equal(shaped.previousVersion, null);
  assert.equal(shaped.previousVersionNote, null);
});

// --- 5. 내부 id/검증자/관리자 감사정보가 공개 DTO에 없는지 ---

test("publicVersion and publicSource never carry internal user ids or raw numeric PKs", () => {
  const version = publicVersion(baseVersionRow({ _id: 7, _supersedesId: 3 }), { sources: [publicSource({ publisher: "환경부", title: "공고", url: "https://me.go.kr/x", checkedOn: "2026-01-01", checkedBy: 999 })] });
  const serialized = JSON.stringify(version);
  for (const forbidden of ["checkedBy", "verifiedBy", "createdBy", "updatedBy", "_id", "_supersedesId", "policyId", "versionId"]) {
    assert.ok(!serialized.includes(forbidden), `${forbidden} must not leak into the public DTO`);
  }
});

// --- 6. 종료일 미정 vs 명시적 무기한 ---

test("publicVersion passes through endDate/endDateIndefinite independently (no NULL-means-indefinite assumption)", () => {
  const unknown = publicVersion(baseVersionRow({ endDate: null, endDateIndefinite: false }));
  const indefinite = publicVersion(baseVersionRow({ endDate: null, endDateIndefinite: true }));
  assert.equal(unknown.endDate, null);
  assert.equal(unknown.endDateIndefinite, false);
  assert.equal(indefinite.endDate, null);
  assert.equal(indefinite.endDateIndefinite, true);
});

// --- 6-1. 시행일 경과인데 상태 미갱신 → "재확인 필요" 명시(확정 시행으로 추정하지 않음) ---

test("publicVersion flags needsReview instead of assuming ACTIVE/EXPIRED when a date has passed but status wasn't updated", () => {
  const stillScheduledPastDue = publicVersion(baseVersionRow({ status: "SCHEDULED", effectiveDate: "2026-01-01" }), { today: "2026-06-01" });
  assert.equal(stillScheduledPastDue.status, "SCHEDULED", "status itself is never auto-changed");
  assert.equal(stillScheduledPastDue.needsReview, true);

  const scheduledNotYetDue = publicVersion(baseVersionRow({ status: "SCHEDULED", effectiveDate: "2026-12-01" }), { today: "2026-06-01" });
  assert.equal(scheduledNotYetDue.needsReview, false);

  const endDatePassedStillActive = publicVersion(baseVersionRow({ status: "ACTIVE", endDate: "2026-01-01" }), { today: "2026-06-01" });
  assert.equal(endDatePassedStillActive.needsReview, true);

  const cancelledPastDue = publicVersion(baseVersionRow({ status: "SCHEDULED", effectiveDate: "2026-01-01", cancelled: true }), { today: "2026-06-01" });
  assert.equal(cancelledPastDue.needsReview, false, "a cancelled version is never flagged for review");
});

// --- 7. slug 검증 ---

test("slugParam matches the V8 CHECK pattern exactly", () => {
  // V8의 `slug ~ '^[a-z0-9][a-z0-9-]*$'`는 끝/반복 하이픈을 막지 않는다 — "trailing-"도 유효하다
  // (regex 그대로 재현한 결과일 뿐 의도적 완화가 아니다, 여기서는 그 사실만 고정한다).
  for (const ok of ["ev-highway-toll", "a", "a1-b2", "trailing-"]) assert.equal(slugParam(ok), ok);
  for (const bad of ["Ev-Toll", "-leading-dash", "has_underscore", "has space", ""]) {
    assert.throws(() => slugParam(bad), { status: 400 });
  }
});

// --- 8. KST 경계: changesWindow가 주입된 today 기준으로만 계산하는지(서버 시계·시간대에 흔들리지 않음) ---

test("changesWindow computes recentFrom/endingTo as exact day offsets from the given KST date (month/leap-year boundaries)", () => {
  assert.deepEqual(changesWindow("2026-03-01"), { today: "2026-03-01", recentFrom: "2026-01-30", endingTo: "2026-03-31" });
  // 2028년은 윤년이라 2월이 29일 — addDays가 실제 달력을 쓰는지 확인(고정 30일 상수를 쓰지 않음).
  assert.deepEqual(changesWindow("2028-03-01"), { today: "2028-03-01", recentFrom: "2028-01-31", endingTo: "2028-03-31" });
});

// --- 9. 타임라인 SQL 자체에 공개 게이트·오탈자·취소 제외·날짜 직렬화가 들어있는지(문자열 검사) ---

test("GET /api/board/ev/changes sends SQL that gates on publication, excludes CORRECTION/cancelled, and serializes dates via to_char", async (t) => {
  const db = fakeDb([[(sql) => sql.includes("FROM policy_versions v JOIN policy_items p"), () => ({ rows: [] })]]);
  const request = await start(t, db);
  for (const filter of ["", "scheduled", "recent", "ending", "expired", "proposed"]) {
    const query = filter ? `?filter=${filter}` : "";
    assert.equal((await request(`/api/board/ev/changes${query}`)).status, 200, filter);
  }
  const [{ sql }] = db.log.filter(({ sql }) => sql.includes("FROM policy_versions v JOIN policy_items p"));
  assert.match(sql, /p\.deleted_at IS NULL/);
  assert.match(sql, /p\.publication='PUBLISHED'/);
  assert.match(sql, /v\.publication='PUBLISHED'/);
  // 지시 3: "모든 쿼리에 검증 조건을 쓴다"는 설명과 실제 SQL을 일치시킨다.
  assert.match(sql, /v\.verification_status='VERIFIED'/);
  assert.match(sql, /v\.revision_kind<>'CORRECTION'/);
  assert.match(sql, /v\.cancelled_at IS NULL/);
  assert.match(sql, /to_char\(v\.effective_date,'YYYY-MM-DD'\)/);
  assert.match(sql, /to_char\(v\.end_date,'YYYY-MM-DD'\)/);
  // "시행 예정"은 SCHEDULED만, PROPOSED(정부안, 날짜가 지나도 자동 전환되지 않는 상태)는 걸리지 않는다.
  assert.match(sql, /\$1='scheduled' AND v\.status='SCHEDULED'/);
  assert.doesNotMatch(sql, /\$1='scheduled' AND v\.status='PROPOSED'/);
  // 지시 2: "종료"는 확정 상태(ACTIVE/SCHEDULED)의 종료일이 지난 경우만 — PROPOSED는 날짜만으로
  // "시행됐다 끝났다"가 되지 않는다.
  assert.match(sql, /\$1='expired' AND \(v\.status='EXPIRED' OR \(v\.status IN \('ACTIVE','SCHEDULED'\)/);
  // 지시 1: scheduled·proposed는 "아직 더 최신 버전으로 대체되지 않았을 때"만 포함한다 — 각 분기가
  // 다음 " OR "로 넘어가기 전에 NOT EXISTS를 포함하는지만 느슨하게 확인한다(완전한 SQL 파서는 아님).
  assert.match(sql, /\$1='scheduled'[\s\S]*?NOT EXISTS[\s\S]*?OR/);
  assert.match(sql, /\$1='proposed'[\s\S]*?NOT EXISTS/);
});

test("GET /api/board/ev/policies sends SQL that gates on the policy-level and version-level publication/verification and never equates is_current with ACTIVE", async (t) => {
  const db = fakeDb([[(sql) => sql.includes("FROM policy_items p JOIN policy_versions v"), () => ({ rows: [] })]]);
  const request = await start(t, db);
  await request("/api/board/ev/policies");
  const [{ sql }] = db.log;
  assert.match(sql, /p\.deleted_at IS NULL/);
  assert.match(sql, /p\.publication='PUBLISHED'/);
  assert.match(sql, /v\.publication='PUBLISHED'/);
  assert.match(sql, /v\.verification_status='VERIFIED'/);
  assert.match(sql, /v\.is_current/);
  assert.doesNotMatch(sql, /is_current.*=.*'ACTIVE'/);
});
