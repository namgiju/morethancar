import { Router } from "express";
import { fail, positive, text } from "./validation.js";
import { isoDate, oneOf, kstToday, webUrl } from "./motorsport.js";
import { requireCurrentStaff } from "./admin-access.js";

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

// ============================================================================
// 관리자 쓰기 API (STEP 7, MORETHANCAR_EV_TASKS.md §4·§5). /api/board/admin/ev에
// app.js가 adminRouter(ADMIN 전용)보다 먼저 등록한다(motorsport/spots와 같은 자리) —
// 그래야 MANAGER가 접근할 수 있다. 정책 10~15개 규모의 최소 기능만 구현한다(범용 CMS 아님).
//
// 검증 상태와 "확정 상태(status)"의 관계(V8 CHECK `status='PROPOSED' OR verification_status='VERIFIED'`)
// 때문에, 버전을 PROPOSED가 아닌 상태(ACTIVE/SCHEDULED/EXPIRED)로 등록·수정하려면 그 순간 DB가
// verification_status='VERIFIED'를 강제한다. **그렇다고 "상태를 ACTIVE로 골랐다"거나 "확인일
// 날짜를 입력했다"는 사실 자체가 검증을 선언하는 것은 아니다**(STEP 7 사후 검토에서 발견한 결함 —
// 이전 구현은 status가 PROPOSED가 아니면 verifiedOn이 없을 때 오늘 날짜로 채우고 조용히
// VERIFIED로 저장했다, UI도 그 상태에서 체크박스를 자동으로 켜고 비활성화해 사용자가 실제로
// 확인한 적이 없어도 체크된 것처럼 보였다). 지금은 요청 본문에 **명시적인 불린 `confirmVerification`**
// 이 `true`일 때만 VERIFIED로 만든다 — status 선택이나 날짜 입력과는 별개의, 운영자가 직접 켠
// 플래그다(프런트는 이 값을 실제 체크박스 클릭 결과로만 보낸다, 자동 체크 없음). status가
// PROPOSED가 아닌데 confirmVerification이 true가 아니면 저장 자체를 400으로 거부한다(DB가
// 어차피 그 조합을 거부하므로, 더 친절한 메시지로 먼저 막는다) — "일단 초안(PROPOSED)으로 저장한
// 뒤 출처를 등록하고 검증하라"고 안내한다.
//
// "근거"까지 함께 확인: confirmVerification이 true면 "출처가 있다"는 사실도 **같은 요청에서**
// 확인해야 한다 — 검증 의사만 있고 근거가 없는 VERIFIED를 막는다. 버전은 INSERT 전에는
// policy_sources가 존재할 수 없으므로(FK), 등록·수정 요청 본문에 `sources` 배열(출처 1개 이상)을
// **같은 트랜잭션**으로 함께 받아 버전 행과 같이 저장한다(POST /policies, POST .../versions,
// PUT /versions/:id 전부 `sourcesInput()`으로 처리). 수정(PUT)은 이미 DB에 저장된 출처가 있으면
// 그걸로도 충분하다(새로 안 보내도 됨). 기존 `/sources` 단독 엔드포인트는 그대로 남겨
// 둔다(검증을 아직 선언하지 않은 초안에 출처만 먼저 모아두는 용도로 여전히 유효하다).
//
// `/verify`(확인일만 갱신)와 `/verify-confirm`(검증 상태 전환, 출처 1개 이상 필수)은 여전히
// 분리된 별도 작업이다 — 등록·수정 시점의 confirmVerification은 "그 순간 해당 근거로 확인했다"는
// 선언이고, 이후 재확인은 이 두 엔드포인트가 맡는다.
//
// 출처 추가 후 재검증: PROPOSED 버전만 verification_status를 UNVERIFIED로 되돌릴 수 있다(DB
// CHECK가 그 조합을 허용하는 유일한 경우 — ACTIVE/SCHEDULED/EXPIRED는 항상 VERIFIED여야 해서
// 되돌릴 수 없다). 그 외 상태의 공개 전 초안에 `/versions/:id/sources`로 출처를 추가하면 검증
// 상태는 그대로 유지되고, 운영자가 필요하면 /verify-confirm을 다시 호출해 명시적으로 재확인해야
// 한다. (등록·수정 자체에서 받는 `sources`는 이 자동 되돌림과 무관하다 — 그 순간 검증을 새로
// 선언하는 것이므로 "이미 검증된 걸 출처 추가로 되돌릴" 상황이 아니다.)
//
// 동시 편집 충돌(지시 8): 새 락 컬럼을 추가하지 않는다(§3.4). 정책 기본 정보·버전 초안 수정은
// 클라이언트가 이전에 받은 updatedAt을 expectedUpdatedAt으로 돌려보내고, 서버가 잠근 행의 현재
// updated_at과 다르면 409로 거부한다(기존 updated_at 컬럼만으로 감지 — 새 스키마 없음).
//
// 같은 정책에 대한 동시 쓰기 직렬화(STEP 7 사후 검토에서 보강): 버전 번호 발급(새 버전 등록)과
// 대표 버전 승격(promote)은 **먼저 정책 부모 행(policy_items)을 `SELECT ... FOR UPDATE`로 잠근
// 뒤에만** 버전 행을 읽거나 쓴다 — 항상 같은 순서(정책 행 → 버전 행)로 잠그므로, 같은 정책에
// 대한 이 두 종류의 쓰기는 전부 정책 행의 락 하나로 차례차례 처리된다("대표가 아직 없는 정책에
// 두 버전을 동시에 승격"·"대표를 서로 다른 버전으로 동시에 교체" 같은 경쟁에서 유니크 위반이나
// 부분 반영이 생기지 않게 하는 지점이 바로 이 정책 행 락이다. 상세 근거는 `/versions/:id/promote`
// 핸들러 주석 참고). 이 직렬화가 실제 PostgreSQL에서도 그대로 동작하는지는 아직 확인하지
// 않았다 — mock DB 테스트는 SQL이 이 순서로 나가는지만 본다(§ 완료 보고의 "남은 검증" 참고).

const EV_SCOPES = ["NATIONAL", "REGIONAL"];
const EV_LOG_ACTIONS = ["CREATE", "UPDATE", "PUBLISH", "HIDE", "VERIFY", "DELETE", "RESTORE", "CANCEL", "PROMOTE"];
const EV_ENTITY_TYPES = ["POLICY", "POLICY_VERSION"];

const optionalText = (value, max) => (value === undefined || value === null || value === "" ? null : text(value, max) || null);

// node-pg는 BIGINT(사용자 id) 컬럼을 문자열로 돌려준다(json_agg로 이미 JSON 숫자가 된 경우는
// 영향 없음 — Number()가 숫자에 적용돼도 그대로다). 2^53보다 훨씬 작은 값이라 안전하게 변환한다.
const EV_BIGINT_FIELDS = new Set(["createdBy", "updatedBy", "verifiedBy", "deletedBy", "checkedBy"]);
const numericIds = (row) =>
  row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k, EV_BIGINT_FIELDS.has(k) && v !== null ? Number(v) : v]));

// 두 시각 값(ISO 문자열이든 Postgres의 "+00:00" 오프셋 표기든)이 같은 순간을 가리키는지 비교한다.
// 문자열 형식이 다를 수 있어 문자열 비교 대신 epoch로 비교한다(동시 편집 충돌 감지에 사용).
function sameInstant(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return new Date(a).getTime() === new Date(b).getTime();
}

// expectedUpdatedAt은 선택이 아니라 필수다(STEP 7 사후 검토에서 발견한 결함 수정) — 이전에는
// 클라이언트가 이 필드를 빼먹으면(undefined) 충돌 검사 자체를 건너뛰었다. 지금은 요청 본문에
// 이 키가 아예 없으면(값이 null이어도 키 자체는 있어야 한다 — "한 번도 수정된 적 없음"을 뜻한다)
// 400으로 거부한다. 그래야 "편집 보호가 걸려 있다"는 게 API 계약으로 보장되고, 클라이언트가
// 깜빡 빼먹어서 조용히 충돌 검사를 우회하는 경로가 없어진다.
function checkConcurrency(before, body) {
  if (!body || !("expectedUpdatedAt" in body))
    fail(400, "최신 수정 시각(expectedUpdatedAt)을 함께 보내주세요. 최신 내용을 다시 불러온 뒤 수정해주세요.");
  if (!sameInstant(before.updated_at, body.expectedUpdatedAt))
    fail(409, "다른 운영자가 먼저 수정했습니다. 최신 내용을 다시 불러와주세요.");
}

// 출처 1건 입력(등록·수정 시 함께 받는 `sources` 배열과 단독 `/sources` 엔드포인트가 공용으로 쓴다).
function sourceRowInput(row) {
  const r = row ?? {};
  const publisher = text(r.publisher, 100);
  const sourceTitle = text(r.title, 200);
  const url = webUrl(r.url, "출처 URL", true);
  const checkedOn = r.checkedOn === undefined || r.checkedOn === null || r.checkedOn === "" ? kstToday() : isoDate(r.checkedOn, "확인일");
  if (checkedOn > kstToday()) fail(400, "확인일은 오늘(KST) 이후일 수 없습니다.");
  return { publisher, title: sourceTitle, url, checkedOn };
}
// body.sources(배열, 선택)를 검증한다. 없으면 빈 배열 — "검증을 선언하려면 출처가 있어야 한다"는
// 요구는 호출부(versionContentInput이 아니라 각 라우트)가 confirmVerification과 함께 확인한다.
function sourcesInput(body) {
  const list = body?.sources;
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > 20) fail(400, "출처는 배열로, 한 번에 20개까지만 입력할 수 있습니다.");
  return list.map(sourceRowInput);
}

// confirmVerification이 true면 "근거"(출처)도 있어야 한다 — 같은 요청에 포함된 출처(inlineSources)
// 이거나, 수정(PUT)이라면 이미 DB에 저장된 출처로도 충분하다(existingVersionId가 있을 때만 조회 —
// 신규 등록은 버전 행이 아직 없어 조회할 대상 자체가 없다). 둘 다 없으면 409로 거부한다(검증
// 의사만 있고 근거가 없는 VERIFIED를 막는다, 파일 상단 설명 참고).
async function requireVerificationGrounds(client, content, inlineSources, existingVersionId = null) {
  if (!content.confirmVerification || inlineSources.length > 0) return;
  if (existingVersionId) {
    const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM policy_sources WHERE policy_version_id=$1", [existingVersionId]);
    if (rows[0].n > 0) return;
  }
  fail(409, "검증을 확인하려면 공식 출처를 1개 이상 등록해야 합니다.");
}
const insertSources = (client, versionId, sources, staffId) =>
  Promise.all(sources.map((s) =>
    client.query(
      "INSERT INTO policy_sources(policy_version_id,publisher,title,url,checked_on,checked_by) VALUES($1,$2,$3,$4,$5,$6)",
      [versionId, s.publisher, s.title, s.url, s.checkedOn, staffId],
    ),
  ));

// 버전 내용 입력(등록·수정 공용). status가 PROPOSED가 아니면 DB CHECK가 VERIFIED를 강제하지만,
// **그 사실 자체가 검증을 선언하지 않는다** — 요청이 명시적으로 confirmVerification:true를 보낸
// 경우에만 VERIFIED로 만든다(파일 상단 설명 참고). status가 PROPOSED가 아닌데 confirmVerification이
// true가 아니면 저장을 거부한다(DB도 어차피 거부하지만, 여기서 더 친절한 메시지로 먼저 막는다).
// "근거"(출처)가 있는지는 이 함수가 아니라 호출부가 sourcesInput()·기존 출처 수와 함께 확인한다
// (이 함수는 DB 접근이 없는 순수 검증 함수로 유지한다).
function versionContentInput(body, staff) {
  const b = body ?? {};
  const summary = text(b.summary, 300);
  const keyPoints = text(b.keyPoints, 2000);
  const target = text(b.target, 300);
  const benefit = text(b.benefit, 2000);
  const howToApply = text(b.howToApply, 1000);
  const note = optionalText(b.note, 500);
  const status = oneOf(b.status, EV_STATUSES, "시행 상태를 선택해주세요.");
  const announcedOn = b.announcedOn === undefined || b.announcedOn === null || b.announcedOn === "" ? null : isoDate(b.announcedOn, "공식 발표일");
  const effectiveDate = b.effectiveDate === undefined || b.effectiveDate === null || b.effectiveDate === "" ? null : isoDate(b.effectiveDate, "시행일");
  const endDate = b.endDate === undefined || b.endDate === null || b.endDate === "" ? null : isoDate(b.endDate, "종료일");
  const endDateIndefinite = b.endDateIndefinite === true;
  if (endDateIndefinite && endDate) fail(400, "종료일을 무기한으로 표시할 경우 종료일 날짜는 함께 입력하지 마세요.");
  if (endDateIndefinite && status === "EXPIRED") fail(400, "무기한 종료일은 이미 종료(EXPIRED) 상태와 함께 설정할 수 없습니다.");
  if (endDate && effectiveDate && endDate < effectiveDate) fail(400, "종료일이 시행일보다 앞설 수 없습니다.");
  if ((status === "ACTIVE" || status === "SCHEDULED") && !effectiveDate) fail(400, "적용 중·시행 예정 상태는 시행일을 입력해야 합니다.");

  const changeConfirmed = status !== "PROPOSED";
  // confirmVerification은 status·날짜 입력과 완전히 독립된, 운영자가 직접 켠 불린 플래그여야 한다.
  const confirmVerification = b.confirmVerification === true;
  if (changeConfirmed && !confirmVerification)
    fail(400, "적용 중·시행 예정·종료 상태로 저장하려면 공식 출처로 확인했음을 명시적으로 확인해야 합니다. 먼저 검토 중(PROPOSED)으로 저장하거나, 확인 체크와 출처를 함께 입력해주세요.");
  let verifiedOn = null;
  if (confirmVerification) {
    verifiedOn = b.verifiedOn === undefined || b.verifiedOn === null || b.verifiedOn === "" ? kstToday() : isoDate(b.verifiedOn, "확인일");
    if (verifiedOn > kstToday()) fail(400, "확인일은 오늘(KST) 이후일 수 없습니다.");
  }
  const verificationStatus = confirmVerification ? "VERIFIED" : "UNVERIFIED";
  const verifiedBy = confirmVerification ? staff.id : null;

  return {
    summary, keyPoints, target, benefit, howToApply, note, status, changeConfirmed, confirmVerification,
    announcedOn, effectiveDate, endDate, endDateIndefinite,
    verificationStatus, lastVerifiedOn: verifiedOn, verifiedBy,
  };
}

// --- 관리자 응답 형태 (공개 응답과 달리 내부 id·관리 컬럼을 그대로 포함한다) ---

const adminPolicyColumns = `SELECT p.id, p.slug, p.title, p.category, p.scope, p.region_note AS "regionNote", p.featured,
 p.publication, p.published_at AS "publishedAt", p.created_by AS "createdBy", p.updated_by AS "updatedBy",
 p.created_at AS "createdAt", p.updated_at AS "updatedAt", p.deleted_at AS "deletedAt", p.deleted_by AS "deletedBy",
 (SELECT COUNT(*)::int FROM policy_versions v WHERE v.policy_id=p.id) AS "versionCount",
 (SELECT json_build_object('versionNo',v.version_no,'status',v.status,'publication',v.publication,
    'verificationStatus',v.verification_status,'lastVerifiedOn',to_char(v.last_verified_on,'YYYY-MM-DD'))
  FROM policy_versions v WHERE v.policy_id=p.id AND v.is_current) AS "currentVersion"`;
const adminPolicyFrom = "FROM policy_items p";

const adminVersionColumns = `SELECT v.id, v.policy_id AS "policyId", v.version_no AS "versionNo", v.revision_kind AS "revisionKind",
 v.supersedes_version_id AS "supersedesVersionId",
 v.summary, v.key_points AS "keyPoints", v.target, v.benefit, v.how_to_apply AS "howToApply", v.note,
 v.status, v.change_confirmed AS "changeConfirmed",
 to_char(v.announced_on,'YYYY-MM-DD') AS "announcedOn", to_char(v.effective_date,'YYYY-MM-DD') AS "effectiveDate",
 to_char(v.end_date,'YYYY-MM-DD') AS "endDate", v.end_date_indefinite AS "endDateIndefinite",
 v.verification_status AS "verificationStatus", to_char(v.last_verified_on,'YYYY-MM-DD') AS "lastVerifiedOn", v.verified_by AS "verifiedBy",
 v.publication, v.published_at AS "publishedAt", v.is_current AS "isCurrent",
 v.cancelled_at AS "cancelledAt", v.cancellation_note AS "cancellationNote", v.change_summary AS "changeSummary",
 v.created_by AS "createdBy", v.created_at AS "createdAt", v.updated_by AS "updatedBy", v.updated_at AS "updatedAt"`;
const adminVersionFrom = "FROM policy_versions v";

// 출처는 버전 개수와 무관하게 쿼리 1번으로 배치 조회한다(공개 API attachSourcesAndPrevious와 같은 이유).
async function attachAdminSources(db, rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const { rows: sourceRows } = await db.query(
    `SELECT id, policy_version_id AS "policyVersionId", publisher, title, url, to_char(checked_on,'YYYY-MM-DD') AS "checkedOn",
       checked_by AS "checkedBy", created_at AS "createdAt"
     FROM policy_sources WHERE policy_version_id = ANY($1::int[]) ORDER BY id`,
    [ids],
  );
  const byVersion = new Map();
  for (const s of sourceRows) {
    if (!byVersion.has(s.policyVersionId)) byVersion.set(s.policyVersionId, []);
    byVersion.get(s.policyVersionId).push(numericIds(s));
  }
  return rows.map((r) => ({ ...numericIds(r), sources: byVersion.get(r.id) ?? [] }));
}

async function transaction(db, work) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    // 제약 위반은 사용자가 고칠 수 있는 입력 문제다(그 밖의 DB 오류는 app.js가 503으로 바꾼다).
    if (error.code === "23505") fail(409, "다른 운영자가 먼저 처리했습니다. 새로고침 후 다시 시도해주세요.");
    if (error.code === "23503") fail(400, "참조한 항목을 찾을 수 없습니다.");
    if (error.code === "23514") fail(400, "입력 내용을 확인해주세요.");
    throw error;
  } finally {
    client.release();
  }
}

const log = (client, entityType, entityId, action, before, after, actor, reason = null) =>
  client.query(
    `INSERT INTO content_admin_logs(entity_type,entity_id,action,before,after,reason,actor_id,actor_role)
     VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)`,
    [entityType, entityId, action, before && JSON.stringify(before), after && JSON.stringify(after), reason, actor.id, actor.role],
  );

const rowJson = (table) => `SELECT row_to_json(t) AS row FROM ${table} t WHERE t.id=$1`;
const policyRow = async (client, id) => (await client.query(rowJson("policy_items"), [id])).rows[0].row;
const versionRow = async (client, id) => (await client.query(rowJson("policy_versions"), [id])).rows[0].row;
const lockPolicy = async (client, id) => {
  const before = (await client.query(`${rowJson("policy_items")} FOR UPDATE`, [id])).rows[0]?.row;
  if (!before) fail(404, "정책을 찾을 수 없습니다.");
  return before;
};
const lockVersion = async (client, id) => {
  const before = (await client.query(`${rowJson("policy_versions")} FOR UPDATE`, [id])).rows[0]?.row;
  if (!before) fail(404, "버전을 찾을 수 없습니다.");
  return before;
};
const adminPolicy = async (client, id) =>
  numericIds((await client.query(`${adminPolicyColumns} ${adminPolicyFrom} WHERE p.id=$1`, [id])).rows[0]);
async function adminVersion(client, id) {
  const { rows } = await client.query(`${adminVersionColumns} ${adminVersionFrom} WHERE v.id=$1`, [id]);
  const [withSources] = await attachAdminSources(client, rows);
  return withSources;
}

export function evAdminRouter({ db, auth }) {
  const router = Router();
  // 로그인 확인 후 현재 DB 역할이 MANAGER 이상인지 매 요청 확인한다(motorsport.js와 같은 패턴).
  router.use(auth, async (req, res, next) => {
    req.staff = await requireCurrentStaff(db, req.user, "MANAGER");
    next();
  });
  router.param("id", (req, res, next, id) => {
    req.params.id = positive(id);
    next();
  });

  // ?q(제목·slug 검색) &category &deleted=exclude|include|only &page
  router.get("/policies", async (req, res) => {
    const q = req.query.q === undefined ? "" : text(req.query.q, 100, false);
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const category = req.query.category === undefined ? "" : oneOf(req.query.category, EV_CATEGORIES, "분류를 확인해주세요.");
    const deleted = req.query.deleted ?? "exclude";
    oneOf(deleted, ["exclude", "include", "only"], "삭제 필터를 확인해주세요.");
    const page = positive(req.query.page ?? 1);
    const { rows } = await db.query(
      `WITH filtered AS (${adminPolicyColumns} ${adminPolicyFrom}
         WHERE (p.title ILIKE $1 OR p.slug ILIKE $1) AND ($2='' OR p.category=$2)
         AND ($3='include' OR ($3='exclude' AND p.deleted_at IS NULL) OR ($3='only' AND p.deleted_at IS NOT NULL)))
       SELECT (SELECT count(*)::int FROM filtered) AS total,
       COALESCE((SELECT json_agg(item) FROM (SELECT * FROM filtered ORDER BY id DESC LIMIT 20 OFFSET $4) item),'[]'::json) AS items`,
      [like, category, deleted, (page - 1) * 20],
    );
    const { total, items } = rows[0];
    res.json({ total, page, pageSize: 20, items: items.map(numericIds) });
  });

  router.get("/policies/:id", async (req, res) => {
    const policy = await adminPolicy(db, req.params.id);
    if (!policy) fail(404, "정책을 찾을 수 없습니다.");
    res.json(policy);
  });

  router.get("/policies/:id/versions", async (req, res) => {
    const policy = (await db.query("SELECT id FROM policy_items WHERE id=$1", [req.params.id])).rows[0];
    if (!policy) fail(404, "정책을 찾을 수 없습니다.");
    const { rows } = await db.query(`${adminVersionColumns} ${adminVersionFrom} WHERE v.policy_id=$1 ORDER BY v.version_no`, [req.params.id]);
    res.json({ versions: await attachAdminSources(db, rows) });
  });

  // 정책 항목 등록 + 첫 버전(INITIAL) 동시 생성(같은 트랜잭션, §4). 기본은 둘 다 초안이다 —
  // 공개는 출처·검증을 갖춘 뒤 별도 publish 작업으로만 한다(등록과 동시 공개 단축 경로를 두지 않는다).
  router.post("/policies", async (req, res) => {
    const b = req.body ?? {};
    const policy = await transaction(db, async (client) => {
      const slug = slugParam(b.slug);
      const category = oneOf(b.category, EV_CATEGORIES, "분류(구매·지원/운행·혜택)를 선택해주세요.");
      const scope = oneOf(b.scope, EV_SCOPES, "전국/지역 구분을 선택해주세요.");
      const regionNote = scope === "REGIONAL" ? text(b.regionNote, 300) : null;
      const title = text(b.title, 150);
      const featured = b.featured === true;
      const content = versionContentInput(b, req.staff);
      const sources = sourcesInput(b);
      await requireVerificationGrounds(client, content, sources);
      const { rows } = await client.query(
        "INSERT INTO policy_items(slug,category,scope,region_note,title,featured,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [slug, category, scope, regionNote, title, featured, req.staff.id],
      );
      const policyId = rows[0].id;
      const { rows: versionRows } = await client.query(
        `INSERT INTO policy_versions(policy_id,version_no,revision_kind,supersedes_version_id,summary,key_points,target,benefit,how_to_apply,note,
           status,change_confirmed,announced_on,effective_date,end_date,end_date_indefinite,
           verification_status,last_verified_on,verified_by,change_summary,created_by)
         VALUES($1,1,'INITIAL',NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NULL,$17) RETURNING id`,
        [policyId, content.summary, content.keyPoints, content.target, content.benefit, content.howToApply, content.note,
         content.status, content.changeConfirmed, content.announcedOn, content.effectiveDate, content.endDate, content.endDateIndefinite,
         content.verificationStatus, content.lastVerifiedOn, content.verifiedBy, req.staff.id],
      );
      await insertSources(client, versionRows[0].id, sources, req.staff.id);
      await log(client, "POLICY", policyId, "CREATE", null, await policyRow(client, policyId), req.staff);
      return adminPolicy(client, policyId);
    });
    res.status(201).json(policy);
  });

  // 정책 기본 정보만 수정한다(분류·전국/지역 구분·지역 설명·제목·featured). slug는 받지 않는다
  // (등록 후 변경 금지, §6). 내용·상태·검증은 버전 쪽 책임이라 여기서 다루지 않는다.
  router.put("/policies/:id", async (req, res) => {
    const b = req.body ?? {};
    const policy = await transaction(db, async (client) => {
      const before = await lockPolicy(client, req.params.id);
      if (before.deleted_at) fail(409, "삭제된 정책은 복원한 뒤 수정할 수 있습니다.");
      checkConcurrency(before, b);
      const category = oneOf(b.category, EV_CATEGORIES, "분류(구매·지원/운행·혜택)를 선택해주세요.");
      const scope = oneOf(b.scope, EV_SCOPES, "전국/지역 구분을 선택해주세요.");
      const regionNote = scope === "REGIONAL" ? text(b.regionNote, 300) : null;
      const title = text(b.title, 150);
      const featured = b.featured === true;
      await client.query(
        "UPDATE policy_items SET category=$2,scope=$3,region_note=$4,title=$5,featured=$6,updated_by=$7,updated_at=NOW() WHERE id=$1",
        [req.params.id, category, scope, regionNote, title, featured, req.staff.id],
      );
      await log(client, "POLICY", req.params.id, "UPDATE", before, await policyRow(client, req.params.id), req.staff);
      return adminPolicy(client, req.params.id);
    });
    res.json(policy);
  });

  // 정책 전체 공개 게이트(§3.6-1) — 개별 버전은 건드리지 않는다. publish: 초안·비공개 → 공개,
  // hide: 공개 → 비공개. 같은 상태로의 전환은 409.
  for (const [path, action, from, to] of [
    ["publish", "PUBLISH", ["DRAFT", "HIDDEN"], "PUBLISHED"],
    ["hide", "HIDE", ["PUBLISHED"], "HIDDEN"],
  ]) {
    router.post(`/policies/:id/${path}`, async (req, res) => {
      const reason = optionalText(req.body?.reason, 500);
      const policy = await transaction(db, async (client) => {
        const before = await lockPolicy(client, req.params.id);
        if (before.deleted_at) fail(409, "삭제된 정책은 공개 상태를 바꿀 수 없습니다.");
        if (!from.includes(before.publication))
          fail(409, to === "PUBLISHED" ? "이미 공개된 정책입니다." : "공개 중인 정책만 비공개로 바꿀 수 있습니다.");
        // $2를 두 곳에서 쓰므로 둘 다 ::text로 캐스트해야 한다 — 그렇지 않으면 Postgres가 타입을
        // 일관되게 추론하지 못해 "inconsistent types deduced for parameter $2" 오류가 난다(STEP 7
        // 사후 검토에서 실제 PostgreSQL로 재현해 발견 — mock DB 테스트는 SQL을 실행하지 않아 이
        // 오류를 못 잡았다). spots.js/motorsport.js의 publish/hide도 같은 이유로 ::text를 쓴다.
        await client.query(
          `UPDATE policy_items SET publication=$2::text,published_at=COALESCE(published_at,CASE WHEN $2::text='PUBLISHED' THEN NOW() END),
             updated_by=$3,updated_at=NOW() WHERE id=$1`,
          [req.params.id, to, req.staff.id],
        );
        await log(client, "POLICY", req.params.id, action, before, await policyRow(client, req.params.id), req.staff, reason);
        return adminPolicy(client, req.params.id);
      });
      res.json(policy);
    });
  }

  // 삭제·복원은 ADMIN 전용(현재 DB 역할로 다시 확인). 소프트 삭제라 버전·출처는 그대로 보존되고
  // 공개 API에서만 사라진다(publicGate의 policy_items 조건이 항상 걸려 있어서다, ev.js §4.1).
  router.delete("/policies/:id", async (req, res) => {
    const reason = optionalText(req.body?.reason, 500);
    await transaction(db, async (client) => {
      const admin = await requireCurrentStaff(client, req.user, "ADMIN");
      const before = await lockPolicy(client, req.params.id);
      if (before.deleted_at) fail(409, "이미 삭제된 정책입니다.");
      await client.query("UPDATE policy_items SET deleted_at=NOW(),deleted_by=$2 WHERE id=$1", [req.params.id, admin.id]);
      await log(client, "POLICY", req.params.id, "DELETE", before, await policyRow(client, req.params.id), admin, reason);
    });
    res.status(204).end();
  });

  router.post("/policies/:id/restore", async (req, res) => {
    const reason = optionalText(req.body?.reason, 500);
    const policy = await transaction(db, async (client) => {
      const admin = await requireCurrentStaff(client, req.user, "ADMIN");
      const before = await lockPolicy(client, req.params.id);
      if (!before.deleted_at) fail(409, "삭제되지 않은 정책입니다.");
      await client.query(
        "UPDATE policy_items SET deleted_at=NULL,deleted_by=NULL,updated_by=$2,updated_at=NOW() WHERE id=$1",
        [req.params.id, admin.id],
      );
      await log(client, "POLICY", req.params.id, "RESTORE", before, await policyRow(client, req.params.id), admin, reason);
      return adminPolicy(client, req.params.id);
    });
    res.json(policy);
  });

  // 새 버전 등록(CHANGE/CORRECTION). 정책 행을 잠가(FOR UPDATE) 그 안에서 다음 version_no를
  // 계산한다(동시 등록 충돌 방지, §3.3·§3.4). supersedesVersionId는 반드시 같은 정책의 기존
  // 버전이어야 한다 — 복합 FK(V8)가 최종 방어선이고, 여기서는 먼저 조회해 더 친절한 400을 준다.
  router.post("/policies/:id/versions", async (req, res) => {
    const b = req.body ?? {};
    const version = await transaction(db, async (client) => {
      const policy = await lockPolicy(client, req.params.id);
      if (policy.deleted_at) fail(409, "삭제된 정책은 복원한 뒤 새 버전을 등록할 수 있습니다.");
      const revisionKind = oneOf(b.revisionKind, ["CHANGE", "CORRECTION"], "버전 종류(정책 변경·오탈자 수정)를 선택해주세요.");
      const changeSummary = text(b.changeSummary, 500);
      const supersedesVersionId = positive(b.supersedesVersionId);
      const supersedes = (await client.query(
        "SELECT id FROM policy_versions WHERE id=$1 AND policy_id=$2", [supersedesVersionId, req.params.id],
      )).rows[0];
      if (!supersedes) fail(400, "대체할 이전 버전을 찾을 수 없습니다. 같은 정책의 버전만 선택할 수 있습니다.");
      const content = versionContentInput(b, req.staff);
      const sources = sourcesInput(b);
      await requireVerificationGrounds(client, content, sources);
      const nextNo = (await client.query("SELECT COALESCE(MAX(version_no),0)+1 AS next FROM policy_versions WHERE policy_id=$1", [req.params.id])).rows[0].next;
      const { rows } = await client.query(
        `INSERT INTO policy_versions(policy_id,version_no,revision_kind,supersedes_version_id,summary,key_points,target,benefit,how_to_apply,note,
           status,change_confirmed,announced_on,effective_date,end_date,end_date_indefinite,
           verification_status,last_verified_on,verified_by,change_summary,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
        [req.params.id, nextNo, revisionKind, supersedesVersionId,
         content.summary, content.keyPoints, content.target, content.benefit, content.howToApply, content.note,
         content.status, content.changeConfirmed, content.announcedOn, content.effectiveDate, content.endDate, content.endDateIndefinite,
         content.verificationStatus, content.lastVerifiedOn, content.verifiedBy, changeSummary, req.staff.id],
      );
      const id = rows[0].id;
      await insertSources(client, id, sources, req.staff.id);
      await log(client, "POLICY_VERSION", id, "CREATE", null, await versionRow(client, id), req.staff);
      return adminVersion(client, id);
    });
    res.status(201).json(version);
  });

  // 미공개 초안만 수정할 수 있다(published_at IS NULL — 한 번이라도 공개됐던 버전은 수정하지 않고
  // 새 버전을 등록한다, §3.3). revisionKind·supersedesVersionId는 바꾸지 않는다(구조적 식별자).
  router.put("/versions/:id", async (req, res) => {
    const b = req.body ?? {};
    const version = await transaction(db, async (client) => {
      const before = await lockVersion(client, req.params.id);
      if (before.published_at) fail(409, "이미 한 번이라도 공개된 버전은 수정할 수 없습니다. 새 버전을 등록해주세요.");
      checkConcurrency(before, b);
      const content = versionContentInput(b, req.staff);
      const sources = sourcesInput(b);
      await requireVerificationGrounds(client, content, sources, before.id);
      const changeSummary = before.revision_kind === "INITIAL" ? null : text(b.changeSummary, 500);
      await client.query(
        `UPDATE policy_versions SET summary=$2,key_points=$3,target=$4,benefit=$5,how_to_apply=$6,note=$7,
           status=$8,change_confirmed=$9,announced_on=$10,effective_date=$11,end_date=$12,end_date_indefinite=$13,
           verification_status=$14,last_verified_on=$15,verified_by=$16,change_summary=$17,updated_by=$18,updated_at=NOW()
         WHERE id=$1`,
        [req.params.id, content.summary, content.keyPoints, content.target, content.benefit, content.howToApply, content.note,
         content.status, content.changeConfirmed, content.announcedOn, content.effectiveDate, content.endDate, content.endDateIndefinite,
         content.verificationStatus, content.lastVerifiedOn, content.verifiedBy, changeSummary, req.staff.id],
      );
      await insertSources(client, req.params.id, sources, req.staff.id);
      await log(client, "POLICY_VERSION", req.params.id, "UPDATE", before, await versionRow(client, req.params.id), req.staff);
      return adminVersion(client, req.params.id);
    });
    res.json(version);
  });

  // 출처 추가 — 이미 한 번이라도 공개된 버전에는 추가하지 않는다(§3.3, 지적 5). 기존 출처
  // 행은 어떤 경우에도 수정·삭제하지 않는다(엔드포인트 자체를 두지 않음).
  router.post("/versions/:id/sources", async (req, res) => {
    const source = sourceRowInput(req.body);
    const version = await transaction(db, async (client) => {
      const before = await lockVersion(client, req.params.id);
      if (before.published_at) fail(409, "이미 한 번이라도 공개된 버전에는 출처를 추가할 수 없습니다. 새 버전을 등록해주세요.");
      await insertSources(client, req.params.id, [source], req.staff.id);
      // 내용(출처)이 바뀌면 재검증이 필요하다(지시). DB CHECK상 PROPOSED만 UNVERIFIED로 되돌릴 수
      // 있다 — 그 외 상태는 항상 VERIFIED여야 해서(V8 CHECK) 되돌릴 수 없고, 필요하면 운영자가
      // /verify-confirm을 다시 호출해 명시적으로 재확인해야 한다.
      if (before.status === "PROPOSED" && before.verification_status === "VERIFIED") {
        await client.query(
          "UPDATE policy_versions SET verification_status='UNVERIFIED',last_verified_on=NULL,verified_by=NULL,updated_by=$2,updated_at=NOW() WHERE id=$1",
          [req.params.id, req.staff.id],
        );
      }
      await log(client, "POLICY_VERSION", req.params.id, "UPDATE", before, await versionRow(client, req.params.id), req.staff, "출처 추가");
      return adminVersion(client, req.params.id);
    });
    res.status(201).json(version);
  });

  // 버전 단위 공개. 미검증이거나 출처가 없으면 거부한다(§3.3 "출처 없는 정책 공개 금지" — DB가
  // 표현할 수 없는 "자식 행 1개 이상" 조건은 여기서 직접 확인한다). SCHEDULED·ACTIVE는 시행일이
  // 반드시 있어야 한다(versionContentInput에서도 검사하지만, 등록 이후 상태 그대로 공개되는
  // 경로이므로 한 번 더 확인한다 — 방어적 이중 확인).
  router.post("/versions/:id/publish", async (req, res) => {
    const version = await transaction(db, async (client) => {
      const before = await lockVersion(client, req.params.id);
      const policy = await lockPolicy(client, before.policy_id);
      if (policy.deleted_at) fail(409, "삭제된 정책의 버전은 공개할 수 없습니다.");
      if (before.publication === "PUBLISHED") fail(409, "이미 공개된 버전입니다.");
      if (before.verification_status !== "VERIFIED") fail(409, "공식 출처 검증(VERIFIED)이 끝난 버전만 공개할 수 있습니다.");
      const sourceCount = (await client.query("SELECT COUNT(*)::int AS n FROM policy_sources WHERE policy_version_id=$1", [req.params.id])).rows[0].n;
      if (sourceCount < 1) fail(409, "공식 출처를 1개 이상 등록해야 공개할 수 있습니다.");
      if ((before.status === "ACTIVE" || before.status === "SCHEDULED") && !before.effective_date)
        fail(409, "적용 중·시행 예정 상태는 시행일이 있어야 공개할 수 있습니다.");
      await client.query(
        "UPDATE policy_versions SET publication='PUBLISHED',published_at=COALESCE(published_at,NOW()),updated_by=$2,updated_at=NOW() WHERE id=$1",
        [req.params.id, req.staff.id],
      );
      await log(client, "POLICY_VERSION", req.params.id, "PUBLISH", before, await versionRow(client, req.params.id), req.staff);
      return adminVersion(client, req.params.id);
    });
    res.json(version);
  });

  // 대표 버전을 HIDDEN으로 바꾸면 같은 트랜잭션에서 is_current도 내린다(그렇지 않으면 V8
  // CHECK `NOT is_current OR publication='PUBLISHED'`가 저장 자체를 거부한다, §3.6-1).
  router.post("/versions/:id/hide", async (req, res) => {
    const version = await transaction(db, async (client) => {
      const before = await lockVersion(client, req.params.id);
      if (before.publication !== "PUBLISHED") fail(409, "공개 중인 버전만 비공개로 바꿀 수 있습니다.");
      await client.query(
        "UPDATE policy_versions SET publication='HIDDEN',is_current=false,updated_by=$2,updated_at=NOW() WHERE id=$1",
        [req.params.id, req.staff.id],
      );
      await log(client, "POLICY_VERSION", req.params.id, "HIDE", before, await versionRow(client, req.params.id), req.staff);
      return adminVersion(client, req.params.id);
    });
    res.json(version);
  });

  // 확인일만 갱신한다 — 검증 상태는 바꾸지 않는다(§3.2, "확인일 갱신 ≠ 검증 완료").
  router.post("/versions/:id/verify", async (req, res) => {
    const b = req.body ?? {};
    const verifiedOn = b.verifiedOn === undefined || b.verifiedOn === null || b.verifiedOn === "" ? kstToday() : isoDate(b.verifiedOn, "확인일");
    if (verifiedOn > kstToday()) fail(400, "확인일은 오늘(KST) 이후일 수 없습니다.");
    const version = await transaction(db, async (client) => {
      const before = await lockVersion(client, req.params.id);
      await client.query("UPDATE policy_versions SET last_verified_on=$2,updated_by=$3,updated_at=NOW() WHERE id=$1", [req.params.id, verifiedOn, req.staff.id]);
      await log(client, "POLICY_VERSION", req.params.id, "VERIFY", before, await versionRow(client, req.params.id), req.staff);
      return adminVersion(client, req.params.id);
    });
    res.json(version);
  });

  // 검증 상태를 UNVERIFIED → VERIFIED로 전환하는 유일한 경로(§3.2·§3.3). 출처가 없으면 "검증"
  // 자체가 근거 없는 주장이 되므로 먼저 거부한다.
  router.post("/versions/:id/verify-confirm", async (req, res) => {
    const b = req.body ?? {};
    const verifiedOn = b.verifiedOn === undefined || b.verifiedOn === null || b.verifiedOn === "" ? kstToday() : isoDate(b.verifiedOn, "확인일");
    if (verifiedOn > kstToday()) fail(400, "확인일은 오늘(KST) 이후일 수 없습니다.");
    const version = await transaction(db, async (client) => {
      const before = await lockVersion(client, req.params.id);
      const sourceCount = (await client.query("SELECT COUNT(*)::int AS n FROM policy_sources WHERE policy_version_id=$1", [req.params.id])).rows[0].n;
      if (sourceCount < 1) fail(409, "공식 출처를 1개 이상 등록한 뒤 검증할 수 있습니다.");
      await client.query(
        "UPDATE policy_versions SET verification_status='VERIFIED',last_verified_on=$2,verified_by=$3,updated_by=$3,updated_at=NOW() WHERE id=$1",
        [req.params.id, verifiedOn, req.staff.id],
      );
      await log(client, "POLICY_VERSION", req.params.id, "VERIFY", before, await versionRow(client, req.params.id), req.staff, "검증 완료로 전환");
      return adminVersion(client, req.params.id);
    });
    res.json(version);
  });

  // 대표 버전 승격. 대상이 PUBLISHED·취소되지 않았는지 확인한 뒤, 기존 대표 버전(있다면)을
  // 내리고 대상을 올린다 — 둘 다 같은 트랜잭션.
  //
  // **동시성 수정(STEP 7 사후 검토에서 발견한 결함)**: 이전 구현은 대상 버전부터 잠그고 "지금
  // is_current인 행"을 그 다음에 조회했는데, 이 두 단계 사이에 정책 부모 행에 대한 락이 전혀
  // 없었다. 대표가 아직 없는 정책(또는 두 버전이 동시에 대표를 다투는 상황)에서 서로 다른 버전을
  // 동시에 승격하면, 두 트랜잭션 모두 "지금 대표가 없다"는 커밋 전 상태를 보고 각자 자신을
  // is_current=true로 쓸 수 있었다 — `policy_versions_one_current` 부분 유니크 인덱스가 최종적으로
  // 하나는 23505(→409)로 막긴 하지만, 그건 "직렬화되어 둘 다 올바르게 처리"가 아니라 "하나가
  // 불필요하게 실패"하는 결과다. (이전 주석은 "동적 조회라 교착이 없다"고 적었는데, 이는 실제
  // PostgreSQL로 재현하지 않고 단정한 것이었다 — 교착은 아니지만 유니크 위반 경쟁은 실제로 있었다,
  // 이번에 정정한다.)
  //
  // 고쳐서: 버전 등록(POST /policies/:id/versions)이 이미 정책 부모 행을 `SELECT ... FOR UPDATE`로
  // 먼저 잠그므로, 승격도 **같은 순서**(정책 부모 행 → 그 다음 버전 행)로 잠그게 맞췄다. 이러면
  // 같은 정책에 대한 승격·버전 등록 요청은 전부 정책 행의 락 하나로 직렬화되어, "지금 대표" 조회가
  // 항상 이전 트랜잭션이 커밋을 마친 뒤의 최신 상태를 본다 — 두 트랜잭션이 서로 다른 자원을
  // 들고 서로를 기다리는 순환(교착)도 구조적으로 생기지 않는다(모두 같은 자원 하나, 정책 행을
  // 두고만 경쟁한다). 다만 **이 직렬화 자체도 아직 실제 PostgreSQL로 동시 요청을 재현해 확인한
  // 적은 없다** — mock DB 테스트는 SQL이 이 순서로 나가는지만 확인한다(아래 남은 검증 참고).
  router.post("/versions/:id/promote", async (req, res) => {
    const version = await transaction(db, async (client) => {
      const versionRef = (await client.query("SELECT policy_id FROM policy_versions WHERE id=$1", [req.params.id])).rows[0];
      if (!versionRef) fail(404, "버전을 찾을 수 없습니다.");
      await client.query("SELECT id FROM policy_items WHERE id=$1 FOR UPDATE", [versionRef.policy_id]);
      const target = await lockVersion(client, req.params.id);
      if (target.publication !== "PUBLISHED") fail(409, "공개된 버전만 대표로 지정할 수 있습니다.");
      if (target.cancelled_at) fail(409, "취소된 버전은 대표로 지정할 수 없습니다.");
      if (target.is_current) fail(409, "이미 대표 버전입니다.");
      // 정책 부모 행 락으로 이미 직렬화됐으므로, 이 조회는 FOR UPDATE가 없어도 항상 최신 커밋
      // 상태를 본다(동시에 다른 트랜잭션이 이 값을 바꾸는 중일 수 없다).
      const current = (await client.query(
        "SELECT id FROM policy_versions WHERE policy_id=$1 AND is_current", [target.policy_id],
      )).rows[0];
      if (current) {
        await client.query("UPDATE policy_versions SET is_current=false,updated_by=$2,updated_at=NOW() WHERE id=$1", [current.id, req.staff.id]);
      }
      await client.query("UPDATE policy_versions SET is_current=true,updated_by=$2,updated_at=NOW() WHERE id=$1", [target.id, req.staff.id]);
      await log(client, "POLICY_VERSION", target.id, "PROMOTE", target, await versionRow(client, target.id), req.staff);
      return adminVersion(client, target.id);
    });
    res.json(version);
  });

  // 아직 대표 버전이 아닌 예정 변경을 취소한다(행은 지우지 않고 cancelled_at/cancellation_note만
  // 채운다, §3.6). 대표 버전은 먼저 다른 버전을 승격해야 취소할 수 있다(V8 CHECK로도 막혀 있다).
  router.post("/versions/:id/cancel", async (req, res) => {
    const note = text(req.body?.cancellationNote, 500);
    const version = await transaction(db, async (client) => {
      const before = await lockVersion(client, req.params.id);
      if (before.is_current) fail(409, "대표 버전은 취소할 수 없습니다. 먼저 다른 버전을 승격해주세요.");
      if (before.cancelled_at) fail(409, "이미 취소된 버전입니다.");
      await client.query(
        "UPDATE policy_versions SET cancelled_at=NOW(),cancellation_note=$2,updated_by=$3,updated_at=NOW() WHERE id=$1",
        [req.params.id, note, req.staff.id],
      );
      await log(client, "POLICY_VERSION", req.params.id, "CANCEL", before, await versionRow(client, req.params.id), req.staff, note);
      return adminVersion(client, req.params.id);
    });
    res.json(version);
  });

  // 감사 로그 조회. ?entityType &action &actorId &page
  router.get("/logs", async (req, res) => {
    const entityType = req.query.entityType === undefined ? "" : oneOf(req.query.entityType, EV_ENTITY_TYPES, "대상 종류를 확인해주세요.");
    const action = req.query.action === undefined ? "" : oneOf(req.query.action, EV_LOG_ACTIONS, "작업 종류를 확인해주세요.");
    const actorId = req.query.actorId === undefined ? null : positive(req.query.actorId);
    const page = positive(req.query.page ?? 1);
    const { rows } = await db.query(
      `WITH filtered AS (SELECT l.id,l.entity_type AS "entityType",l.entity_id AS "entityId",l.action,l.before,l.after,l.reason,
         l.actor_id AS "actorId",l.actor_role AS "actorRole",u.username AS "actorUsername",l.created_at AS "createdAt"
         FROM content_admin_logs l JOIN users u ON u.id=l.actor_id
         WHERE l.entity_type IN ('POLICY','POLICY_VERSION') AND ($1='' OR l.entity_type=$1) AND ($2='' OR l.action=$2)
         AND ($3::bigint IS NULL OR l.actor_id=$3))
       SELECT (SELECT count(*)::int FROM filtered) AS total,
       COALESCE((SELECT json_agg(item) FROM (SELECT * FROM filtered ORDER BY id DESC LIMIT 20 OFFSET $4) item),'[]'::json) AS items`,
      [entityType, action, actorId, (page - 1) * 20],
    );
    res.json({ ...rows[0], page, pageSize: 20 });
  });

  // 재확인 대기열: 공개 중이고 취소되지 않은 버전 중 확인일이 olderThan일(기본 60일)보다 오래된 것.
  router.get("/stale", async (req, res) => {
    const olderThan = req.query.olderThan === undefined ? 60 : positive(req.query.olderThan);
    if (olderThan > 366) fail(400, "기간은 366일 이내로 입력해주세요.");
    const today = kstToday();
    const { rows } = await db.query(
      `SELECT p.id AS "policyId", p.slug, p.title, v.id, v.version_no AS "versionNo", v.status, to_char(v.last_verified_on,'YYYY-MM-DD') AS "lastVerifiedOn"
       FROM policy_versions v JOIN policy_items p ON p.id=v.policy_id
       WHERE v.publication='PUBLISHED' AND p.deleted_at IS NULL AND v.cancelled_at IS NULL AND v.last_verified_on < $1::date
       ORDER BY v.last_verified_on LIMIT 200`,
      [addDays(today, -olderThan)],
    );
    res.json({ today, olderThan, versions: rows });
  });

  return router;
}
