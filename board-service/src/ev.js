import { Router } from "express";
import { fail, positive, text } from "./validation.js";
import { oneOf, kstToday } from "./motorsport.js";

// 전기차 정책·정보 허브 — 공개 조회 API만(MORETHANCAR_EV_TASKS.md §4·STEP 2). 관리자 쓰기 API는
// 후속 단계다(이 파일에 evAdminRouter는 아직 없다). 스키마는 Flyway V8(policy_items/policy_versions/
// policy_sources, 아직 어떤 DB에도 적용되지 않음 — STEP 2는 DB 접속·마이그레이션 실행을 하지 않는다).
//
// 공개 게이트(모든 쿼리에 일관되게 적용, V8 §3.6-1):
//  - 정책 전체: policy_items.deleted_at IS NULL AND policy_items.publication='PUBLISHED'
//  - 버전 하나하나: policy_versions.publication='PUBLISHED'
//    (is_current인 버전은 V8 CHECK로 이미 publication='PUBLISHED' AND verification_status='VERIFIED'가
//    보장되지만, 쿼리에도 조건을 다시 쓴다 — 스키마 보증에만 의존하지 않고 쿼리 자체도 안전하게 만든다)
//  - is_current는 "목록·상세의 대표 버전"이라는 뜻일 뿐 "지금 ACTIVE로 시행 중"이 아니다. 최초 등록이
//    SCHEDULED·PROPOSED·EXPIRED여도 대표 버전이 되어 계속 탐색 가능하다 — 이 파일 어디서도 is_current를
//    status==='ACTIVE'의 동의어로 쓰지 않는다.
//
// 날짜 직렬화: DATE 컬럼은 전부 to_char(...,'YYYY-MM-DD')로 문자열로 꺼낸다. node-pg가 DATE를
// 서버 로컬 시간대 JS Date로 바꾸면 하루 밀릴 수 있다(motorsport.js의 기존 주석과 동일한 이유) —
// 이 파일은 그 패턴을 전기차 날짜 컬럼(effective_date, end_date, announced_on, last_verified_on,
// checked_on) 전부에 그대로 적용한다.
//
// 종료일 규칙: end_date가 NULL이라는 것은 "정보 없음"일 뿐 "무기한"이 아니다. end_date_indefinite가
// true일 때만 "무기한(공식 확인됨)"이고, false인데 end_date도 NULL이면 "미확인"이다 — 이 파일은 둘을
// 섞어 응답하지 않고 endDate/endDateIndefinite를 그대로 내려보낸다(화면이 구분해서 표시, STEP 3 책임).
//
// 내부 정보 제외: 응답에 사용자 id(createdBy/updatedBy/verifiedBy/checkedBy), 정책·버전·출처의 원본
// 숫자 PK, 관리자 감사 컬럼(createdAt/updatedAt 등)을 넣지 않는다. 정책의 공개 식별자는 slug,
// 버전의 공개 식별자는 (slug, versionNo) 조합이다.

export const EV_CATEGORIES = ["BUY", "DRIVE"];
export const EV_STATUSES = ["ACTIVE", "SCHEDULED", "PROPOSED", "EXPIRED"];
export const CHANGE_FILTERS = ["scheduled", "recent", "ending", "expired", "proposed"];
// "최근 시행"·"종료 예정" 창(문서화: MORETHANCAR_EV_TASKS.md §4). 둘 다 30일로 고정한다.
export const RECENT_WINDOW_DAYS = 30;
export const ENDING_WINDOW_DAYS = 30;
const MAX_LIMIT = 200;
const DAY_MS = 86_400_000;

const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// 타임라인 조회에 쓰는 날짜 경계(오늘·최근 창 시작·종료 예정 창 끝)를 계산하는 순수 함수.
// 단위 테스트에서 직접 확인한다(KST 기준일 산출이 서버 시간대에 영향받지 않는지).
export function changesWindow(today = kstToday()) {
  return { today, recentFrom: addDays(today, -RECENT_WINDOW_DAYS), endingTo: addDays(today, ENDING_WINDOW_DAYS) };
}

// --- slug 검증 (policy_items.slug CHECK와 같은 패턴) ---

export function slugParam(value) {
  if (typeof value !== "string" || value.length > 80 || !/^[a-z0-9][a-z0-9-]*$/.test(value))
    fail(400, "정책 주소를 확인해주세요.");
  return value;
}

// --- 응답 형태 (순수 함수 — 단위 테스트에서 직접 확인한다) ---

// 출처: 확인자(내부 사용자 id)는 제외하고 publisher/title/url/checkedOn만 공개한다.
export function publicSource(row) {
  return { publisher: row.publisher, title: row.title, url: row.url, checkedOn: row.checkedOn };
}

// 시행일은 지났는데 상태가 아직 SCHEDULED로 남아 있거나(승격이 안 된 것), 종료일은 지났는데
// EXPIRED로 안 바뀐 경우 — 이걸 보고 "그러니 지금은 ACTIVE/EXPIRED겠지"라고 추정하지 않는다
// (지시: "확정 시행처럼 추정하지 말고 재확인 필요 여부를 명시"). status 값 자체는 그대로 두고
// needsReview만 true로 올려 화면이 "재확인 필요" 배지를 보여주게 한다 — DB를 갱신하지 않는다.
function needsReview(row, today) {
  if (row.cancelled) return false;
  if (row.status === "SCHEDULED" && row.effectiveDate && row.effectiveDate <= today) return true;
  if (row.status !== "EXPIRED" && row.endDate && row.endDate < today) return true;
  return false;
}

// 버전 하나의 공개 DTO. sources/previousVersion/previousVersionNote는 호출부가 배치 조회 후 채운다
// (N+1 방지 — 버전 개수만큼 출처·이전 버전을 따로 조회하지 않는다). today는 호출부가 kstToday()로
// 넘긴다(순수 함수를 유지하려고 암묵적으로 "지금"을 읽지 않는다 — 단위 테스트에서 고정값 주입 가능).
export function publicVersion(row, { sources = [], previousVersion = null, previousVersionNote = null, today = kstToday() } = {}) {
  return {
    versionNo: row.versionNo,
    revisionKind: row.revisionKind,
    summary: row.summary,
    keyPoints: row.keyPoints,
    target: row.target,
    benefit: row.benefit,
    howToApply: row.howToApply,
    note: row.note,
    status: row.status,
    changeConfirmed: row.changeConfirmed,
    needsReview: needsReview(row, today),
    announcedOn: row.announcedOn,
    effectiveDate: row.effectiveDate,
    endDate: row.endDate,
    endDateIndefinite: row.endDateIndefinite,
    lastVerifiedOn: row.lastVerifiedOn,
    changeSummary: row.changeSummary,
    cancelled: row.cancelled,
    cancellationNote: row.cancellationNote,
    sources,
    previousVersion,
    previousVersionNote,
  };
}

// policy_versions 원시 행(내부 id 포함, _로 시작하는 필드)에 출처와 "이전 버전 비교"를 배치로
// 붙여 공개 DTO 배열로 바꾸는 공용 헬퍼. /policies/:slug와 /changes가 함께 쓴다.
//  - 출처: policy_version_id로 한 번에 조회(버전 개수와 무관하게 쿼리 1번).
//  - 이전 버전: supersedesId가 가리키는 행이 publication='PUBLISHED'일 때만 비교 정보를 보여주고,
//    그렇지 않으면(비공개·숨김) previousVersion은 null, previousVersionNote로 이유를 명시한다
//    (지시: "supersedes가 비공개이면 이전 본문·출처를 노출하지 말고 비교 정보가 없음을 명시").
//    INITIAL은 대체할 버전이 없으므로 둘 다 null로 둔다(명시할 "없음"조차 없음 — 비교 대상 자체가 없다).
export async function attachSourcesAndPrevious(db, rows, today = kstToday()) {
  if (!rows.length) return [];
  const versionIds = rows.map((r) => r._id);
  const { rows: sourceRows } = await db.query(
    `SELECT policy_version_id AS "_versionId", publisher, title, url, to_char(checked_on,'YYYY-MM-DD') AS "checkedOn"
     FROM policy_sources WHERE policy_version_id = ANY($1::int[]) ORDER BY id`,
    [versionIds],
  );
  const sourcesByVersion = new Map();
  for (const s of sourceRows) {
    if (!sourcesByVersion.has(s._versionId)) sourcesByVersion.set(s._versionId, []);
    sourcesByVersion.get(s._versionId).push(publicSource(s));
  }

  // 비교(이전 버전)에는 summary만으로 "뭐가 바뀌었는지" 알기 부족해 status·benefit도 공개한다
  // (요청 전문 전체는 아님 — target/howToApply/keyPoints는 굳이 비교에 필요하지 않아 넣지 않는다).
  // verification_status='VERIFIED'를 명시적으로 걸어 "공개된 버전은 전부 검증까지 끝났다"는
  // 설명과 실제 쿼리를 일치시킨다(publication='PUBLISHED'면 V8 CHECK로 이미 보장되지만, 쿼리
  // 자체에도 같은 조건을 다시 쓴다 — 스키마 보증에만 의존하지 않는다).
  const supersedesIds = [...new Set(rows.map((r) => r._supersedesId).filter((id) => id !== null))];
  const previousById = new Map();
  if (supersedesIds.length) {
    const { rows: prevRows } = await db.query(
      `SELECT id AS "_id", version_no AS "versionNo", summary, status, benefit,
         to_char(effective_date,'YYYY-MM-DD') AS "effectiveDate", to_char(end_date,'YYYY-MM-DD') AS "endDate"
       FROM policy_versions WHERE id = ANY($1::int[]) AND publication='PUBLISHED' AND verification_status='VERIFIED'`,
      [supersedesIds],
    );
    for (const p of prevRows)
      previousById.set(p._id, { versionNo: p.versionNo, summary: p.summary, status: p.status, benefit: p.benefit, effectiveDate: p.effectiveDate, endDate: p.endDate });
  }

  return rows.map((row) => {
    const sources = sourcesByVersion.get(row._id) ?? [];
    let previousVersion = null;
    let previousVersionNote = null;
    if (row.revisionKind !== "INITIAL") {
      const prev = previousById.get(row._supersedesId);
      if (prev) previousVersion = prev;
      else previousVersionNote = "이전 버전의 공개 정보를 확인할 수 없습니다.";
    }
    return publicVersion(row, { sources, previousVersion, previousVersionNote, today });
  });
}

// 이 버전이 "이미 다른(취소되지 않은, 공개된) 버전으로 대체됐는지" — 더 이상 살아있는 예정 변경이
// 아니므로 upcomingChanges/변경 타임라인의 "시행 예정·검토 중" 목록에서 빠져야 한다(이력에는 남는다).
// policy_versions 전체 행 집합이 있을 때(한 정책의 모든 공개 버전을 이미 메모리에 들고 있을 때)
// 추가 쿼리 없이 계산한다 — /policies/:slug가 이 방식을 쓴다.
export function supersededIds(rows) {
  return new Set(rows.filter((r) => !r.cancelled).map((r) => r._supersedesId).filter((id) => id !== null));
}

// --- SQL 조각 ---

// 목록("카드")에 쓰는 가벼운 컬럼 집합(지시: 정책명·핵심 혜택·정책 상태·적용 대상·최종 확인일).
// 본문 전체(keyPoints/benefit/howToApply)·출처·이력은 목록에 넣지 않는다(상세에서만).
const policyColumns = `p.slug, p.title, p.category, p.scope, p.region_note AS "regionNote", p.featured`;
const cardVersionColumns = `v.version_no AS "versionNo", v.summary, v.target, v.status,
 v.change_confirmed AS "changeConfirmed", to_char(v.effective_date,'YYYY-MM-DD') AS "effectiveDate",
 to_char(v.end_date,'YYYY-MM-DD') AS "endDate", v.end_date_indefinite AS "endDateIndefinite",
 to_char(v.last_verified_on,'YYYY-MM-DD') AS "lastVerifiedOn"`;

// 상세·타임라인에 쓰는 전체 컬럼 집합. _로 시작하는 필드는 서버 내부에서만 쓰고 응답에 포함하지 않는다
// (publicVersion()이 그 필드들을 읽지 않으므로 자연히 빠진다 — attachSourcesAndPrevious가 쓰는 것뿐).
const fullVersionColumns = `v.id AS "_id", v.supersedes_version_id AS "_supersedesId",
 v.version_no AS "versionNo", v.revision_kind AS "revisionKind",
 v.summary, v.key_points AS "keyPoints", v.target, v.benefit, v.how_to_apply AS "howToApply", v.note,
 v.status, v.change_confirmed AS "changeConfirmed",
 to_char(v.announced_on,'YYYY-MM-DD') AS "announcedOn", to_char(v.effective_date,'YYYY-MM-DD') AS "effectiveDate",
 to_char(v.end_date,'YYYY-MM-DD') AS "endDate", v.end_date_indefinite AS "endDateIndefinite",
 to_char(v.last_verified_on,'YYYY-MM-DD') AS "lastVerifiedOn",
 v.change_summary AS "changeSummary", (v.cancelled_at IS NOT NULL) AS "cancelled", v.cancellation_note AS "cancellationNote"`;

// 정책 전체 게이트 + 버전 공개 게이트(모든 공개 쿼리가 공통으로 건다, V8 §3.6-1).
// verification_status='VERIFIED'는 publication='PUBLISHED'면 V8 CHECK로 이미 보장되지만,
// "모든 공개 쿼리에 검증 조건을 명시적으로 쓴다"는 주석과 실제 SQL을 일치시키려고 다시 쓴다
// (스키마 보증 하나에만 의존하지 않고 쿼리 자체도 안전하게 만든다는 원칙, V8 §3.6-1과 동일).
const publicGate = `p.deleted_at IS NULL AND p.publication='PUBLISHED' AND v.publication='PUBLISHED' AND v.verification_status='VERIFIED'`;

export function evRouter({ db }) {
  const router = Router();
  router.param("slug", (req, res, next, slug) => {
    req.params.slug = slugParam(slug);
    next();
  });

  // ?category=BUY|DRIVE &status=ACTIVE|SCHEDULED|PROPOSED|EXPIRED &featured=true|false &q=(제목 검색) &limit(1~200)
  // 대표 버전(is_current)만 보여준다. PROPOSED·EXPIRED인 대표 버전도 포함한다(탐색 가능성 — is_current를
  // ACTIVE의 동의어로 쓰지 않는다).
  router.get("/policies", async (req, res) => {
    const category = req.query.category === undefined ? "" : oneOf(req.query.category, EV_CATEGORIES, "카테고리를 확인해주세요.");
    const status = req.query.status === undefined ? "" : oneOf(req.query.status, EV_STATUSES, "시행 상태를 확인해주세요.");
    const featured = req.query.featured === undefined ? null : oneOf(req.query.featured, ["true", "false"], "featured 값을 확인해주세요.") === "true";
    const q = req.query.q === undefined ? "" : text(req.query.q, 100, false);
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const limit = req.query.limit === undefined ? 50 : positive(req.query.limit);
    if (limit > MAX_LIMIT) fail(400, `한 번에 ${MAX_LIMIT}개까지만 조회할 수 있습니다.`);
    const { rows } = await db.query(
      `SELECT ${policyColumns}, ${cardVersionColumns}
       FROM policy_items p JOIN policy_versions v ON v.policy_id=p.id AND v.is_current
       WHERE ${publicGate} AND ($1='' OR p.category=$1) AND ($2='' OR v.status=$2)
         AND ($3::boolean IS NULL OR p.featured=$3) AND ($4='' OR p.title ILIKE $5)
       ORDER BY p.featured DESC, p.id LIMIT $6`,
      [category, status, featured, q, like, limit],
    );
    res.json({ policies: rows });
  });

  // 정책 상세: 대표 버전(current) + 공개된 "살아있는" 예정 변경(upcomingChanges) + 전체 공개 이력
  // (history, CORRECTION·취소·이미 대체된 과거 예정안 포함 — 누적 보존) + 관련 공개 정책(같은
  // category, 최대 5개). 없거나/비공개/삭제된 정책은 모두 같은 404(이유를 구분해 알려주지 않는다).
  router.get("/policies/:slug", async (req, res) => {
    const policyRow = (await db.query(
      `SELECT p.id AS "_id", ${policyColumns} FROM policy_items p WHERE p.slug=$1 AND p.deleted_at IS NULL AND p.publication='PUBLISHED'`,
      [req.params.slug],
    )).rows[0];
    if (!policyRow) fail(404, "삭제되었거나 없는 정책입니다.");
    const { _id, ...policy } = policyRow;

    const { rows: versionRows } = await db.query(
      `SELECT ${fullVersionColumns}, v.is_current AS "_isCurrent"
       FROM policy_versions v WHERE v.policy_id=$1 AND v.publication='PUBLISHED' AND v.verification_status='VERIFIED'
       ORDER BY v.version_no`,
      [_id],
    );
    // 대표 버전이 하나도 없으면(아직 공개된 버전이 없는 정책) 보여줄 내용이 없는 것과 같다 — 404.
    if (!versionRows.some((r) => r._isCurrent)) fail(404, "삭제되었거나 없는 정책입니다.");

    const shaped = await attachSourcesAndPrevious(db, versionRows);
    const current = shaped[versionRows.findIndex((r) => r._isCurrent)];
    // "곧 달라지는 변경"은 ①대표가 아니고 ②취소되지 않았고 ③오탈자 수정이 아니고 ④실제로 아직
    // 시행되지 않은 상태(SCHEDULED·PROPOSED)이고 ⑤다른 더 최신 버전으로 이미 대체되지 않은
    // 것만이다. 과거 ACTIVE/EXPIRED 이력이나 이미 대체된 옛 예정안이 "곧 달라지는 변경"으로
    // 잘못 보이는 문제를 막는다(history에는 그대로 전부 남아 있다).
    const superseded = supersededIds(versionRows);
    const upcomingChanges = shaped.filter((v, i) => {
      const row = versionRows[i];
      return !row._isCurrent && !v.cancelled && v.revisionKind !== "CORRECTION" &&
        (v.status === "SCHEDULED" || v.status === "PROPOSED") && !superseded.has(row._id);
    });

    const { rows: related } = await db.query(
      `SELECT p2.slug, p2.title, v2.summary, v2.status
       FROM policy_items p2 JOIN policy_versions v2 ON v2.policy_id=p2.id AND v2.is_current
       WHERE p2.category=$1 AND p2.slug<>$2 AND p2.deleted_at IS NULL
         AND p2.publication='PUBLISHED' AND v2.publication='PUBLISHED' AND v2.verification_status='VERIFIED'
       ORDER BY p2.id LIMIT 5`,
      [policy.category, req.params.slug],
    );

    res.json({ ...policy, current, upcomingChanges, history: shaped, relatedPolicies: related });
  });

  // ?filter=scheduled|recent|ending|expired|proposed &limit(1~200)
  // 필터 범위(문서화, MORETHANCAR_EV_TASKS.md §4.2와 동일하게 유지한다):
  //  - scheduled(시행 예정): status='SCHEDULED' AND effectiveDate > 오늘(KST) AND 아직 대체되지 않음
  //  - recent(최근 시행):   status='ACTIVE'    AND effectiveDate가 오늘 포함 지난 30일 안
  //  - ending(종료 예정):   status IN (ACTIVE,SCHEDULED) AND endDate가 오늘 포함 앞으로 30일 안
  //  - expired(종료):       status='EXPIRED' OR (status IN (ACTIVE,SCHEDULED) AND endDate가 오늘보다 과거)
  //    — PROPOSED(미확정 정부안)는 종료일이 지나도 여기 섞이지 않는다. 날짜만으로 정부안을
  //    "시행됐다가 끝났다"고 만들어내지 않는다(지시 2) — 확정 상태(ACTIVE/SCHEDULED/EXPIRED)만 본다.
  //  - proposed(검토 중):   status='PROPOSED'(= changeConfirmed=false, V8 CHECK로 결정론적) AND 아직 대체되지 않음
  // **필터를 생략하면 "다섯 조건의 OR"가 아니라 공개된 변경 전체(기간 조건 없이)를 돌려준다** —
  // 다섯 필터는 전부 특정 시간창 안의 부분집합이라, 효력 기간이 먼 과거이거나 종료일이 먼
  // 미래인 ACTIVE 버전처럼 다섯 필터 중 어느 것에도 안 걸리는 행도 "필터 없음"에는 포함된다.
  // (이전 주석은 "다섯 조건을 OR로 합친 전체"라고 썼는데 실제 SQL과 달랐다 — 이번에 바로잡음, 지시 4).
  // 오탈자(CORRECTION)와 취소된 변경은 필터와 무관하게 항상 제외한다(이력은 /policies/:slug의
  // history에서만 보인다). scheduled·proposed는 추가로 "아직 더 최신 버전으로 대체되지 않았을
  // 때"만 보여준다(지시 1 — 이미 대체된 옛 예정안이 "곧 달라지는 변경"으로 남아 보이지 않게).
  router.get("/changes", async (req, res) => {
    const filter = req.query.filter === undefined ? "" : oneOf(req.query.filter, CHANGE_FILTERS, "필터를 확인해주세요.");
    const limit = req.query.limit === undefined ? 50 : positive(req.query.limit);
    if (limit > MAX_LIMIT) fail(400, `한 번에 ${MAX_LIMIT}개까지만 조회할 수 있습니다.`);
    const { today, recentFrom, endingTo } = changesWindow();
    const notSuperseded = `NOT EXISTS (SELECT 1 FROM policy_versions w WHERE w.supersedes_version_id=v.id AND w.cancelled_at IS NULL AND w.publication='PUBLISHED')`;
    const { rows } = await db.query(
      `SELECT p.slug, p.title, p.category, ${fullVersionColumns}
       FROM policy_versions v JOIN policy_items p ON p.id=v.policy_id
       WHERE ${publicGate} AND v.revision_kind<>'CORRECTION' AND v.cancelled_at IS NULL
         AND (
           $1='' OR
           ($1='scheduled' AND v.status='SCHEDULED' AND v.effective_date IS NOT NULL AND v.effective_date > $2::date AND ${notSuperseded}) OR
           ($1='recent' AND v.status='ACTIVE' AND v.effective_date IS NOT NULL AND v.effective_date <= $2::date AND v.effective_date >= $3::date) OR
           ($1='ending' AND v.status IN ('ACTIVE','SCHEDULED') AND v.end_date IS NOT NULL AND v.end_date >= $2::date AND v.end_date <= $4::date) OR
           ($1='expired' AND (v.status='EXPIRED' OR (v.status IN ('ACTIVE','SCHEDULED') AND v.end_date IS NOT NULL AND v.end_date < $2::date))) OR
           ($1='proposed' AND v.status='PROPOSED' AND ${notSuperseded})
         )
       ORDER BY COALESCE(v.effective_date, v.announced_on) DESC NULLS LAST, "_id" DESC
       LIMIT $5`,
      [filter, today, recentFrom, endingTo, limit],
    );
    const shaped = await attachSourcesAndPrevious(db, rows, today);
    const withPolicy = shaped.map((version, i) => ({ slug: rows[i].slug, title: rows[i].title, category: rows[i].category, ...version }));
    res.json({ today, filter, changes: withPolicy });
  });

  return router;
}
