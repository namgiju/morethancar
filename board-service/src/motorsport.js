import { Router } from "express";
import { fail, positive, text } from "./validation.js";
import { requireCurrentStaff } from "./admin-access.js";

// 모터스포츠 일정(docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md, 1단계: DB·API). 스키마는 Flyway V6.
//  - 공개 API(/api/board/motorsport): 공개(PUBLISHED)이고 삭제되지 않은 일정·활성 시리즈/장소만 읽는다. 로그인 불필요.
//  - 운영 API(/api/board/admin/motorsport): MANAGER 이상(requireCurrentStaff, 현재 DB 역할 기준). 삭제·복원만 ADMIN.
//    MANAGER는 다른 운영자가 등록한 일정도 수정할 수 있다(작성자 제한 없음). 모든 변경은 같은 트랜잭션에서
//    content_admin_logs에 수행자·당시 역할·대상·작업·시각과 변경 전후 행을 남긴다.
//
// 날짜·시간대 규칙(V6 주석과 같다)
//  - startsOn/endsOn: 개최지 현지 날짜(YYYY-MM-DD). 개최지 시간대는 venue.timezone(IANA).
//  - startsAt: 시각이 공개된 경우만. 오프셋이 있는 ISO 8601(…Z 또는 …+09:00)만 받는다(모호한 현지 시각 금지).
//    개최지 현지 날짜로 바꿨을 때 startsOn~endsOn 안이어야 한다. 응답은 UTC ISO 문자열.
//  - verifiedOn: 공식 출처를 마지막으로 확인한 KST 날짜. 오늘(KST)보다 뒤일 수 없다.
//  - 기간 조회는 현지 날짜 기준 겹침: endsOn >= from AND startsOn <= to.

export const EVENT_KINDS = ["RACE", "TRACK_DAY", "EVENT"];
export const EVENT_STATUSES = ["SCHEDULED", "TENTATIVE", "CHANGED", "CANCELLED"];
export const SERIES_SCOPES = ["DOMESTIC", "INTERNATIONAL"];
export const PUBLICATIONS = ["DRAFT", "PUBLISHED", "HIDDEN"];
const MAX_RANGE_DAYS = 92; // 공개 조회 한 번에 최대 약 3개월(캘린더 앞뒤 달 포함)
const MAX_EVENT_DAYS = 31; // V6 CHECK와 같은 값
const DAY_MS = 86_400_000;

// --- 입력 검증 (export: 단위 테스트에서 직접 확인한다) ---

// 엄격한 YYYY-MM-DD. 2026-02-30처럼 존재하지 않는 날짜는 거부한다.
export function isoDate(value, label = "날짜") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    fail(400, `${label}를 YYYY-MM-DD 형식으로 입력해주세요.`);
  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value)
    fail(400, `${label}를 확인해주세요.`);
  return value;
}

// 서머타임이 없는 KST라 상수 오프셋으로 계산해도 안전하다(community.js todayStartKst와 같은 방식).
export function kstToday(now = Date.now()) {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
}

const dayDiff = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// IANA 시간대 이름. Intl이 모르는 이름이면 거부한다.
export function timezone(value) {
  if (typeof value !== "string" || value.length > 64 || !/^[A-Za-z]+(\/[A-Za-z0-9_+-]+)+$/.test(value))
    fail(400, "시간대를 IANA 이름(예: Asia/Seoul)으로 입력해주세요.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    fail(400, "알 수 없는 시간대입니다.");
  }
  return value;
}

// http(s) 절대 URL. 계정 정보가 들어간 URL·공백·제어 문자는 거부한다.
export function webUrl(value, label, required = true) {
  if (!required && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string" || value.length > 500 || /[\s\u0000-\u001F\u007F]/.test(value))
    fail(400, `${label}를 확인해주세요. (http/https 주소, 최대 500자)`);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(400, `${label}를 확인해주세요. (http/https 주소, 최대 500자)`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    fail(400, `${label}를 확인해주세요. (http/https 주소, 최대 500자)`);
  return value;
}

export function oneOf(value, allowed, message) {
  if (!allowed.includes(value)) fail(400, message);
  return value;
}

// 오프셋이 있는 ISO 8601 시각 → Date. 오프셋 없는 값은 어느 시간대인지 알 수 없어 거부한다.
export function instant(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value))
    fail(400, "시작 시각은 시간대가 포함된 ISO 8601 형식(예: 2026-10-25T14:00:00+09:00)으로 입력해주세요.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(400, "시작 시각을 확인해주세요.");
  return date;
}

// 절대 시각을 개최지 현지 날짜(YYYY-MM-DD)로.
export function localDate(date, zone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const optionalText = (value, max) => (value === undefined || value === null || value === "" ? null : text(value, max) || null);

function coordinate(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    fail(400, "좌표 범위를 확인해주세요.");
  return Math.round(value * 1e6) / 1e6;
}

// 공개 조회 기간. 없으면 이번 달(KST) 1일~말일.
export function range(query, today = kstToday()) {
  const from = query.from === undefined ? `${today.slice(0, 7)}-01` : isoDate(query.from, "시작일");
  const to = query.to === undefined
    ? addDays(`${addDays(`${from.slice(0, 7)}-01`, 32).slice(0, 7)}-01`, -1)
    : isoDate(query.to, "종료일");
  const span = dayDiff(from, to);
  if (span < 0) fail(400, "종료일이 시작일보다 앞설 수 없습니다.");
  if (span > MAX_RANGE_DAYS) fail(400, `한 번에 ${MAX_RANGE_DAYS + 1}일까지만 조회할 수 있습니다.`);
  return { from, to };
}

// --- 응답 형태 ---

// DATE는 문자열로 꺼낸다(node-pg가 DATE를 서버 로컬 시간대 Date로 바꿔 하루 밀리는 것을 막는다).
const eventSelect = `SELECT e.id,e.kind,e.title,to_char(e.starts_on,'YYYY-MM-DD') AS "startsOn",to_char(e.ends_on,'YYYY-MM-DD') AS "endsOn",
 to_char(e.starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "startsAt",e.status,e.source_url AS "sourceUrl",e.source_name AS "sourceName",
 to_char(e.verified_on,'YYYY-MM-DD') AS "verifiedOn",e.note,
 CASE WHEN s.id IS NULL THEN NULL ELSE json_build_object('id',s.id,'code',s.code,'name',s.name,'scope',s.scope) END AS series,
 json_build_object('id',v.id,'name',v.name,'country',v.country,'region',v.region,'timezone',v.timezone,
   'latitude',v.latitude,'longitude',v.longitude) AS venue,
 (SELECT COUNT(*)::int FROM board_posts p WHERE p.motorsport_event_id=e.id AND NOT p.deleted) AS "linkedPostCount"`;
const eventFrom = `FROM motorsport_events e JOIN motorsport_venues v ON v.id=e.venue_id
 LEFT JOIN motorsport_series s ON s.id=e.series_id`;
const eventOrder = "ORDER BY e.starts_on,e.starts_at NULLS LAST,e.id";
// 운영 API 응답에만 붙는 관리 정보(공개 상태, 작성·수정·확인·삭제한 운영자 id와 시각).
const adminColumns = `,e.publication,e.published_at AS "publishedAt",e.created_by AS "createdBy",e.updated_by AS "updatedBy",e.verified_by AS "verifiedBy",
 e.created_at AS "createdAt",e.updated_at AS "updatedAt",e.deleted_at AS "deletedAt",e.deleted_by AS "deletedBy"`;

const seriesSelect = `SELECT id,code,name,scope,official_url AS "officialUrl",active FROM motorsport_series`;
const venueSelect = `SELECT id,name,country,region,timezone,official_url AS "officialUrl",latitude::float8 AS latitude,
 longitude::float8 AS longitude,active FROM motorsport_venues`;

// --- 공개 API ---

export function motorsportRouter({ db }) {
  const router = Router();
  router.param("id", (req, res, next, id) => {
    req.params.id = positive(id);
    next();
  });

  // ?from&to(현지 날짜, 기본 이번 달) &scope=DOMESTIC|INTERNATIONAL &series=code &kind &limit(1~200)
  router.get("/events", async (req, res) => {
    const { from, to } = range(req.query);
    const scope = req.query.scope === undefined ? "" : oneOf(req.query.scope, SERIES_SCOPES, "국내/해외 구분을 확인해주세요.");
    const kind = req.query.kind === undefined ? "" : oneOf(req.query.kind, EVENT_KINDS, "일정 종류를 확인해주세요.");
    const series = req.query.series === undefined ? "" : text(req.query.series, 40);
    const limit = req.query.limit === undefined ? 200 : positive(req.query.limit);
    if (limit > 200) fail(400, "한 번에 200개까지만 조회할 수 있습니다.");
    // 시리즈가 없는 일정(스포츠주행일)은 국내 서킷에서 열리므로, scope 필터는 장소 국가로도 판단한다.
    const { rows } = await db.query(
      `${eventSelect} ${eventFrom}
       WHERE e.deleted_at IS NULL AND e.publication='PUBLISHED' AND e.ends_on >= $1::date AND e.starts_on <= $2::date
       AND ($3='' OR COALESCE(s.scope, CASE WHEN v.country='KR' THEN 'DOMESTIC' ELSE 'INTERNATIONAL' END)=$3)
       AND ($4='' OR e.kind=$4) AND ($5='' OR s.code=$5)
       ${eventOrder} LIMIT $6`,
      [from, to, scope, kind, series, limit],
    );
    res.json({ from, to, events: rows });
  });

  router.get("/events/:id", async (req, res) => {
    const { rows } = await db.query(`${eventSelect} ${eventFrom} WHERE e.id=$1 AND e.deleted_at IS NULL AND e.publication='PUBLISHED'`, [req.params.id]);
    // 초안·비공개·삭제된 일정은 없는 일정과 구분하지 않는다.
    if (!rows.length) fail(404, "삭제되었거나 없는 일정입니다.");
    res.json(rows[0]);
  });

  router.get("/series", async (req, res) => {
    res.json((await db.query(`${seriesSelect} WHERE active ORDER BY scope,name`)).rows);
  });
  router.get("/venues", async (req, res) => {
    res.json((await db.query(`${venueSelect} WHERE active ORDER BY country<>'KR',name`)).rows);
  });
  return router;
}

// --- 운영 API (app.js가 /api/board/admin/motorsport에 adminRouter보다 먼저 붙인다) ---

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
    if (error.code === "23505") fail(409, "이미 같은 코드가 있습니다.");
    if (error.code === "23503") fail(400, "선택한 시리즈나 장소를 찾을 수 없습니다.");
    if (error.code === "23514") fail(400, "입력 내용을 확인해주세요.");
    throw error;
  } finally {
    client.release();
  }
}

// 감사 로그: 수행자(id·당시 DB 역할), 대상(종류·id), 작업, 시각(created_at 기본값), 변경 전후 행, 사유.
const log = (client, entityType, entityId, action, before, after, actor, reason = null) =>
  client.query(
    `INSERT INTO content_admin_logs(entity_type,entity_id,action,before,after,reason,actor_id,actor_role)
     VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)`,
    [entityType, entityId, action, before && JSON.stringify(before), after && JSON.stringify(after), reason, actor.id, actor.role],
  );

const rowJson = (table) => `SELECT row_to_json(t) AS row FROM ${table} t WHERE t.id=$1`;
// users.id는 BIGINT라 node-pg가 문자열로 준다(json_agg 경로는 숫자). 응답은 숫자로 맞춘다(id는 2^53보다 훨씬 작다).
const STAFF_ID_FIELDS = ["createdBy", "updatedBy", "verifiedBy", "deletedBy"];
const staffIds = (row) =>
  row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k, STAFF_ID_FIELDS.includes(k) && v !== null ? Number(v) : v]));
const LOG_ACTIONS = ["CREATE", "UPDATE", "PUBLISH", "HIDE", "VERIFY", "DELETE", "RESTORE"];

export function motorsportAdminRouter({ db, auth }) {
  const router = Router();
  // 로그인 확인 후 현재 DB 역할이 MANAGER 이상인지 매 요청 확인한다. req.staff = {id, username, role(DB 기준)}.
  router.use(auth, async (req, res, next) => {
    req.staff = await requireCurrentStaff(db, req.user, "MANAGER");
    next();
  });
  router.param("id", (req, res, next, id) => {
    req.params.id = positive(id);
    next();
  });

  // 일정 입력. 시리즈·장소 존재 여부와 현지 날짜 검사는 장소 시간대가 필요해 DB에서 읽어 온 뒤 한다.
  async function eventInput(client, body) {
    const b = body ?? {};
    const venueId = positive(b.venueId);
    const seriesId = b.seriesId === undefined || b.seriesId === null || b.seriesId === "" ? null : positive(b.seriesId);
    const kind = oneOf(b.kind, EVENT_KINDS, "일정 종류(경기·스포츠주행일·행사)를 선택해주세요.");
    const status = b.status === undefined ? "SCHEDULED" : oneOf(b.status, EVENT_STATUSES, "일정 상태를 확인해주세요.");
    const title = text(b.title, 150);
    const startsOn = isoDate(b.startsOn, "시작일");
    const endsOn = b.endsOn === undefined || b.endsOn === null || b.endsOn === "" ? startsOn : isoDate(b.endsOn, "종료일");
    const span = dayDiff(startsOn, endsOn);
    if (span < 0) fail(400, "종료일이 시작일보다 앞설 수 없습니다.");
    if (span > MAX_EVENT_DAYS) fail(400, `일정 기간은 ${MAX_EVENT_DAYS + 1}일 이내여야 합니다.`);
    const startsAt = instant(b.startsAt);
    const sourceUrl = webUrl(b.sourceUrl, "공식 출처 URL");
    const sourceName = text(b.sourceName, 100);
    const verifiedOn = isoDate(b.verifiedOn, "확인일");
    if (verifiedOn > kstToday()) fail(400, "확인일은 오늘(KST) 이후일 수 없습니다.");
    const note = optionalText(b.note, 500);

    const venue = (await client.query("SELECT id,timezone FROM motorsport_venues WHERE id=$1", [venueId])).rows[0];
    if (!venue) fail(400, "장소를 찾을 수 없습니다.");
    if (seriesId !== null && !(await client.query("SELECT 1 FROM motorsport_series WHERE id=$1", [seriesId])).rows.length)
      fail(400, "시리즈를 찾을 수 없습니다.");
    if (startsAt) {
      const day = localDate(startsAt, venue.timezone);
      if (day < startsOn || day > endsOn)
        fail(400, `시작 시각의 현지 날짜(${day}, ${venue.timezone})가 일정 기간 밖입니다.`);
    }
    return [seriesId, venueId, kind, title, startsOn, endsOn, startsAt, status, sourceUrl, sourceName, verifiedOn, note];
  }

  const adminEvent = async (client, id) =>
    staffIds((await client.query(`${eventSelect}${adminColumns} ${eventFrom} WHERE e.id=$1`, [id])).rows[0]);
  const lockEvent = async (client, id) => {
    const before = (await client.query(`${rowJson("motorsport_events")} FOR UPDATE`, [id])).rows[0]?.row;
    if (!before) fail(404, "일정을 찾을 수 없습니다.");
    return before;
  };
  const eventRow = async (client, id) => (await client.query(rowJson("motorsport_events"), [id])).rows[0].row;

  // ?from&to(선택) &q(제목·출처명) &status &publication &deleted=exclude|include|only &page
  router.get("/events", async (req, res) => {
    const q = req.query.q === undefined ? "" : text(req.query.q, 100, false);
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const status = req.query.status === undefined ? "" : oneOf(req.query.status, EVENT_STATUSES, "일정 상태를 확인해주세요.");
    const publication = req.query.publication === undefined ? "" : oneOf(req.query.publication, PUBLICATIONS, "공개 상태를 확인해주세요.");
    const deleted = req.query.deleted ?? "exclude";
    oneOf(deleted, ["exclude", "include", "only"], "삭제 필터를 확인해주세요.");
    const from = req.query.from === undefined ? null : isoDate(req.query.from, "시작일");
    const to = req.query.to === undefined ? null : isoDate(req.query.to, "종료일");
    const page = positive(req.query.page ?? 1);
    const { rows } = await db.query(
      `WITH filtered AS (${eventSelect}${adminColumns},e.starts_at AS sort_at ${eventFrom}
         WHERE (e.title ILIKE $1 OR e.source_name ILIKE $1) AND ($2='' OR e.status=$2) AND ($3='' OR e.publication=$3)
         AND ($4='include' OR ($4='exclude' AND e.deleted_at IS NULL) OR ($4='only' AND e.deleted_at IS NOT NULL))
         AND ($5::date IS NULL OR e.ends_on >= $5::date) AND ($6::date IS NULL OR e.starts_on <= $6::date))
       SELECT (SELECT count(*)::int FROM filtered) AS total,
       COALESCE((SELECT json_agg(item) FROM (SELECT * FROM filtered ORDER BY "startsOn" DESC,sort_at DESC NULLS LAST,id DESC
         LIMIT 20 OFFSET $7) item),'[]'::json) AS items`,
      [like, status, publication, deleted, from, to, (page - 1) * 20],
    );
    const { total, items } = rows[0];
    res.json({ total, page, pageSize: 20, items: items.map(({ sort_at, ...item }) => item) });
  });

  router.get("/events/:id", async (req, res) => {
    const event = await adminEvent(db, req.params.id);
    if (!event) fail(404, "일정을 찾을 수 없습니다.");
    res.json(event);
  });

  // 등록. 기본은 초안(DRAFT)이고 {publish: true}면 바로 공개한다(로그는 CREATE 하나에 공개 상태가 담긴다).
  router.post("/events", async (req, res) => {
    const publish = req.body?.publish === true;
    const event = await transaction(db, async (client) => {
      const values = await eventInput(client, req.body);
      const { rows } = await client.query(
        `INSERT INTO motorsport_events(series_id,venue_id,kind,title,starts_on,ends_on,starts_at,status,source_url,source_name,
           verified_on,note,verified_by,created_by,publication,published_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14::text,CASE WHEN $14::text='PUBLISHED' THEN NOW() END) RETURNING id`,
        [...values, req.staff.id, publish ? "PUBLISHED" : "DRAFT"],
      );
      const id = rows[0].id;
      await log(client, "MOTORSPORT_EVENT", id, "CREATE", null, await eventRow(client, id), req.staff);
      return adminEvent(client, id);
    });
    res.status(201).json(event);
  });

  // 전체 교체(공개 상태는 바꾸지 않는다 — publish/hide로만). 확인일이 바뀌면 확인한 운영자도 바뀐다.
  // 작성자 제한은 없다: 어느 MANAGER·ADMIN이든 다른 운영자가 등록한 일정을 수정할 수 있다.
  router.put("/events/:id", async (req, res) => {
    const event = await transaction(db, async (client) => {
      const before = await lockEvent(client, req.params.id);
      if (before.deleted_at) fail(409, "삭제된 일정은 복원한 뒤 수정할 수 있습니다.");
      const values = await eventInput(client, req.body);
      await client.query(
        `UPDATE motorsport_events SET series_id=$1,venue_id=$2,kind=$3,title=$4,starts_on=$5,ends_on=$6,starts_at=$7,status=$8,
           source_url=$9,source_name=$10,
           verified_by=CASE WHEN verified_on IS DISTINCT FROM $11::date THEN $14 ELSE verified_by END,
           verified_on=$11,note=$12,updated_by=$14,updated_at=NOW()
         WHERE id=$13`,
        [...values, req.params.id, req.staff.id],
      );
      await log(client, "MOTORSPORT_EVENT", req.params.id, "UPDATE", before, await eventRow(client, req.params.id), req.staff);
      return adminEvent(client, req.params.id);
    });
    res.json(event);
  });

  // 공개 상태 전환. publish: 초안·비공개 → 공개, hide: 공개 → 비공개. 같은 상태로의 전환은 409.
  for (const [path, action, from, to] of [
    ["publish", "PUBLISH", ["DRAFT", "HIDDEN"], "PUBLISHED"],
    ["hide", "HIDE", ["PUBLISHED"], "HIDDEN"],
  ]) {
    router.post(`/events/:id/${path}`, async (req, res) => {
      const reason = optionalText(req.body?.reason, 500);
      const event = await transaction(db, async (client) => {
        const before = await lockEvent(client, req.params.id);
        if (before.deleted_at) fail(409, "삭제된 일정은 공개 상태를 바꿀 수 없습니다.");
        if (!from.includes(before.publication))
          fail(409, to === "PUBLISHED" ? "이미 공개된 일정입니다." : "공개 중인 일정만 비공개로 바꿀 수 있습니다.");
        await client.query(
          `UPDATE motorsport_events SET publication=$2::text,published_at=COALESCE(published_at,CASE WHEN $2::text='PUBLISHED' THEN NOW() END),
             updated_by=$3,updated_at=NOW() WHERE id=$1`,
          [req.params.id, to, req.staff.id],
        );
        await log(client, "MOTORSPORT_EVENT", req.params.id, action, before, await eventRow(client, req.params.id), req.staff, reason);
        return adminEvent(client, req.params.id);
      });
      res.json(event);
    });
  }

  // 공식 출처를 다시 확인했을 때: 확인일만 갱신한다(기본 오늘 KST).
  router.post("/events/:id/verify", async (req, res) => {
    const verifiedOn = req.body?.verifiedOn === undefined ? kstToday() : isoDate(req.body.verifiedOn, "확인일");
    if (verifiedOn > kstToday()) fail(400, "확인일은 오늘(KST) 이후일 수 없습니다.");
    const event = await transaction(db, async (client) => {
      const before = await lockEvent(client, req.params.id);
      if (before.deleted_at) fail(409, "삭제된 일정은 확인일을 바꿀 수 없습니다.");
      await client.query(
        "UPDATE motorsport_events SET verified_on=$2,verified_by=$3,updated_by=$3,updated_at=NOW() WHERE id=$1",
        [req.params.id, verifiedOn, req.staff.id],
      );
      await log(client, "MOTORSPORT_EVENT", req.params.id, "VERIFY", before, await eventRow(client, req.params.id), req.staff);
      return adminEvent(client, req.params.id);
    });
    res.json(event);
  });

  // 삭제·복원은 ADMIN 전용(현재 DB 역할로 다시 확인). 소프트 삭제라 연결된 후기 글은 남고 공개 API에서만 사라진다.
  router.delete("/events/:id", async (req, res) => {
    const reason = optionalText(req.body?.reason, 500);
    await transaction(db, async (client) => {
      const admin = await requireCurrentStaff(client, req.user, "ADMIN");
      const before = await lockEvent(client, req.params.id);
      if (before.deleted_at) fail(409, "이미 삭제된 일정입니다.");
      await client.query("UPDATE motorsport_events SET deleted_at=NOW(),deleted_by=$2 WHERE id=$1", [req.params.id, admin.id]);
      await log(client, "MOTORSPORT_EVENT", req.params.id, "DELETE", before, await eventRow(client, req.params.id), admin, reason);
    });
    res.status(204).end();
  });

  router.post("/events/:id/restore", async (req, res) => {
    const reason = optionalText(req.body?.reason, 500);
    const event = await transaction(db, async (client) => {
      const admin = await requireCurrentStaff(client, req.user, "ADMIN");
      const before = await lockEvent(client, req.params.id);
      if (!before.deleted_at) fail(409, "삭제되지 않은 일정입니다.");
      await client.query(
        "UPDATE motorsport_events SET deleted_at=NULL,deleted_by=NULL,updated_by=$2,updated_at=NOW() WHERE id=$1",
        [req.params.id, admin.id],
      );
      await log(client, "MOTORSPORT_EVENT", req.params.id, "RESTORE", before, await eventRow(client, req.params.id), admin, reason);
      return adminEvent(client, req.params.id);
    });
    res.json(event);
  });

  // 재확인 대기열: 앞으로 within일 안에 끝나지 않은 일정 중 확인일이 olderThan일보다 오래된 것(삭제·비공개·취소 제외).
  router.get("/stale", async (req, res) => {
    const within = req.query.within === undefined ? 60 : positive(req.query.within);
    const olderThan = req.query.olderThan === undefined ? 14 : positive(req.query.olderThan);
    if (within > 366 || olderThan > 366) fail(400, "기간은 366일 이내로 입력해주세요.");
    const today = kstToday();
    const { rows } = await db.query(
      `${eventSelect}${adminColumns} ${eventFrom}
       WHERE e.deleted_at IS NULL AND e.publication<>'HIDDEN' AND e.status<>'CANCELLED'
       AND e.ends_on >= $1::date AND e.starts_on <= $2::date AND e.verified_on < $3::date
       ORDER BY e.starts_on,e.id LIMIT 200`,
      [today, addDays(today, within), addDays(today, -olderThan)],
    );
    res.json({ today, within, olderThan, events: rows.map(staffIds) });
  });

  // --- 시리즈 / 장소: 삭제 대신 active=false(이미 쓰인 일정이 있을 수 있다). MANAGER 이상 ---

  function seriesInput(body) {
    const b = body ?? {};
    const code = typeof b.code === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(b.code) ? b.code : fail(400, "코드는 영문 소문자·숫자·하이픈(최대 40자)으로 입력해주세요.");
    return [code, text(b.name, 100), oneOf(b.scope, SERIES_SCOPES, "국내/해외 구분을 선택해주세요."),
      webUrl(b.officialUrl, "공식 사이트 URL", false), b.active === undefined ? true : b.active === true];
  }
  function venueInput(body) {
    const b = body ?? {};
    const country = typeof b.country === "string" && /^[A-Z]{2}$/.test(b.country) ? b.country : fail(400, "국가 코드를 2자리 영문 대문자(예: KR)로 입력해주세요.");
    const latitude = coordinate(b.latitude, -90, 90), longitude = coordinate(b.longitude, -180, 180);
    if ((latitude === null) !== (longitude === null)) fail(400, "위도와 경도는 함께 입력해주세요.");
    return [text(b.name, 100), country, optionalText(b.region, 100), timezone(b.timezone),
      webUrl(b.officialUrl, "공식 사이트 URL", false), latitude, longitude, b.active === undefined ? true : b.active === true];
  }

  router.get("/series", async (req, res) => res.json((await db.query(`${seriesSelect} ORDER BY active DESC,scope,name`)).rows));
  router.post("/series", async (req, res) => {
    const values = seriesInput(req.body);
    const row = await transaction(db, async (client) => {
      const { rows } = await client.query(
        "INSERT INTO motorsport_series(code,name,scope,official_url,active) VALUES($1,$2,$3,$4,$5) RETURNING id", values);
      const after = (await client.query(rowJson("motorsport_series"), [rows[0].id])).rows[0].row;
      await log(client, "MOTORSPORT_SERIES", rows[0].id, "CREATE", null, after, req.staff);
      return (await client.query(`${seriesSelect} WHERE id=$1`, [rows[0].id])).rows[0];
    });
    res.status(201).json(row);
  });
  router.put("/series/:id", async (req, res) => {
    const values = seriesInput(req.body);
    const row = await transaction(db, async (client) => {
      const before = (await client.query(`${rowJson("motorsport_series")} FOR UPDATE`, [req.params.id])).rows[0]?.row;
      if (!before) fail(404, "시리즈를 찾을 수 없습니다.");
      await client.query(
        "UPDATE motorsport_series SET code=$1,name=$2,scope=$3,official_url=$4,active=$5,updated_at=NOW() WHERE id=$6",
        [...values, req.params.id]);
      const after = (await client.query(rowJson("motorsport_series"), [req.params.id])).rows[0].row;
      await log(client, "MOTORSPORT_SERIES", req.params.id, "UPDATE", before, after, req.staff);
      return (await client.query(`${seriesSelect} WHERE id=$1`, [req.params.id])).rows[0];
    });
    res.json(row);
  });

  router.get("/venues", async (req, res) => res.json((await db.query(`${venueSelect} ORDER BY active DESC,country<>'KR',name`)).rows));
  router.post("/venues", async (req, res) => {
    const values = venueInput(req.body);
    const row = await transaction(db, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO motorsport_venues(name,country,region,timezone,official_url,latitude,longitude,active)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, values);
      const after = (await client.query(rowJson("motorsport_venues"), [rows[0].id])).rows[0].row;
      await log(client, "MOTORSPORT_VENUE", rows[0].id, "CREATE", null, after, req.staff);
      return (await client.query(`${venueSelect} WHERE id=$1`, [rows[0].id])).rows[0];
    });
    res.status(201).json(row);
  });
  // 장소 시간대를 바꾸면 기존 일정의 startsAt 현지 날짜 검사가 달라질 수 있다 → 그런 일정이 있으면 거부한다.
  router.put("/venues/:id", async (req, res) => {
    const values = venueInput(req.body);
    const row = await transaction(db, async (client) => {
      const before = (await client.query(`${rowJson("motorsport_venues")} FOR UPDATE`, [req.params.id])).rows[0]?.row;
      if (!before) fail(404, "장소를 찾을 수 없습니다.");
      const zone = values[3];
      if (zone !== before.timezone) {
        const { rows } = await client.query(
          `SELECT id,to_char(starts_on,'YYYY-MM-DD') AS s,to_char(ends_on,'YYYY-MM-DD') AS e,starts_at
           FROM motorsport_events WHERE venue_id=$1 AND starts_at IS NOT NULL AND deleted_at IS NULL`, [req.params.id]);
        const broken = rows.filter((r) => { const d = localDate(r.starts_at, zone); return d < r.s || d > r.e; });
        if (broken.length) fail(409, `시간대를 바꾸면 일정 ${broken.map((r) => r.id).join(", ")}의 시작 시각이 기간 밖이 됩니다.`);
      }
      await client.query(
        `UPDATE motorsport_venues SET name=$1,country=$2,region=$3,timezone=$4,official_url=$5,latitude=$6,longitude=$7,active=$8,
         updated_at=NOW() WHERE id=$9`, [...values, req.params.id]);
      const after = (await client.query(rowJson("motorsport_venues"), [req.params.id])).rows[0].row;
      await log(client, "MOTORSPORT_VENUE", req.params.id, "UPDATE", before, after, req.staff);
      return (await client.query(`${venueSelect} WHERE id=$1`, [req.params.id])).rows[0];
    });
    res.json(row);
  });

  // 감사 로그 조회. ?entityType &entityId &action &actorId &page
  router.get("/logs", async (req, res) => {
    const entityType = req.query.entityType === undefined ? "" :
      oneOf(req.query.entityType, ["MOTORSPORT_SERIES", "MOTORSPORT_VENUE", "MOTORSPORT_EVENT"], "대상 종류를 확인해주세요.");
    const entityId = req.query.entityId === undefined ? null : positive(req.query.entityId);
    const action = req.query.action === undefined ? "" : oneOf(req.query.action, LOG_ACTIONS, "작업 종류를 확인해주세요.");
    const actorId = req.query.actorId === undefined ? null : positive(req.query.actorId);
    const page = positive(req.query.page ?? 1);
    const { rows } = await db.query(
      `WITH filtered AS (SELECT l.id,l.entity_type AS "entityType",l.entity_id AS "entityId",l.action,l.before,l.after,l.reason,
         l.actor_id AS "actorId",l.actor_role AS "actorRole",u.username AS "actorUsername",l.created_at AS "createdAt"
         FROM content_admin_logs l JOIN users u ON u.id=l.actor_id
         WHERE l.entity_type LIKE 'MOTORSPORT_%' AND ($1='' OR l.entity_type=$1) AND ($2::bigint IS NULL OR l.entity_id=$2)
         AND ($3='' OR l.action=$3) AND ($4::bigint IS NULL OR l.actor_id=$4))
       SELECT (SELECT count(*)::int FROM filtered) AS total,
       COALESCE((SELECT json_agg(item) FROM (SELECT * FROM filtered ORDER BY id DESC LIMIT 20 OFFSET $5) item),'[]'::json) AS items`,
      [entityType, entityId, action, actorId, (page - 1) * 20],
    );
    res.json({ ...rows[0], page, pageSize: 20 });
  });
  return router;
}
