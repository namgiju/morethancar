import { Router } from "express";
import { fail, positive, text } from "./validation.js";
import { requireCurrentStaff } from "./admin-access.js";
import { oneOf, webUrl } from "./motorsport.js";

// 와인딩·심레이싱 스팟(docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md §2 V7, 2026-10-12 지시로 카테고리를
// WINDING·SIM_RACING 2개로 조정). 스키마는 Flyway V7. 이번 단계는 관리자 직접 등록만 지원한다
// (공개 제보·검토 대기열은 없다).
//  - 공개 API(/api/board/spots): 공개(PUBLISHED)이고 삭제되지 않은 스팟만 읽는다. 로그인 불필요.
//  - 운영 API(/api/board/admin/spots): MANAGER 이상(requireCurrentStaff, 현재 DB 역할 기준). 삭제·복원만 ADMIN.
//    motorsport.js와 같은 패턴: 모든 변경은 같은 트랜잭션에서 content_admin_logs에 남긴다.

export const CATEGORIES = ["WINDING", "SIM_RACING"];
const PUBLICATIONS = ["DRAFT", "PUBLISHED", "HIDDEN"];
const MAX_BBOX_SPAN = 20; // 위도·경도 각 20도까지(한반도 전체를 크게 덮는 정도) — 과도하게 큰 영역 조회를 막는다.

const optionalText = (value, max) => (value === undefined || value === null || value === "" ? null : text(value, max) || null);

function coordinate(value, min, max, required) {
  if (value === undefined || value === null || value === "") {
    if (required) fail(400, "좌표를 입력해주세요.");
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    fail(400, "좌표 범위를 확인해주세요.");
  return Math.round(value * 1e6) / 1e6;
}

function decimal(value, min, max, optional = true) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    fail(400, "숫자 입력 범위를 확인해주세요.");
  return Math.round(value * 10) / 10;
}

// 경유지·경로 좌표([{lat,lng}, ...]). 없으면 null(점 하나만 지도에 표시).
function routeGeometry(value) {
  if (value === undefined || value === null || value === "") return null;
  if (!Array.isArray(value) || value.length < 2 || value.length > 500)
    fail(400, "경로 좌표는 2~500개 배열로 입력해주세요.");
  const points = value.map((p) => {
    if (
      !p ||
      typeof p.lat !== "number" ||
      typeof p.lng !== "number" ||
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng) ||
      p.lat < -90 ||
      p.lat > 90 ||
      p.lng < -180 ||
      p.lng > 180
    )
      fail(400, "경로 좌표 형식을 확인해주세요.");
    return { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 };
  });
  return JSON.stringify(points);
}

function bboxParam(value) {
  if (value === undefined) return null;
  const parts = String(value).split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) fail(400, "지도 영역(bbox)을 확인해주세요.");
  const [swLat, swLng, neLat, neLng] = parts;
  if (swLat < -90 || neLat > 90 || swLng < -180 || neLng > 180 || swLat > neLat || swLng > neLng)
    fail(400, "지도 영역(bbox)을 확인해주세요.");
  if (neLat - swLat > MAX_BBOX_SPAN || neLng - swLng > MAX_BBOX_SPAN) fail(400, "지도 영역이 너무 넓습니다.");
  return { swLat, swLng, neLat, neLng };
}

// --- 응답 형태 ---

const spotSelect = `SELECT s.id,s.category,s.name,s.region,s.address,s.latitude::float8 AS latitude,s.longitude::float8 AS longitude,
 s.description,s.image_url AS "imageUrl",
 s.route_start AS "routeStart",s.route_end AS "routeEnd",s.distance_km::float8 AS "distanceKm",s.duration_minutes AS "durationMinutes",
 s.route,s.recommended_time AS "recommendedTime",s.caution,
 s.business_hours AS "businessHours",s.official_url AS "officialUrl",s.reservation_url AS "reservationUrl",
 s.facility_info AS "facilityInfo",s.price_info AS "priceInfo",
 (SELECT COUNT(*)::int FROM board_posts p WHERE p.spot_id=s.id AND NOT p.deleted) AS "linkedPostCount"`;
const spotFrom = "FROM drive_spots s";
const adminColumns = `,s.publication,s.published_at AS "publishedAt",s.created_by AS "createdBy",s.updated_by AS "updatedBy",
 s.created_at AS "createdAt",s.updated_at AS "updatedAt",s.deleted_at AS "deletedAt",s.deleted_by AS "deletedBy"`;

// --- 공개 API ---

export function spotsRouter({ db }) {
  const router = Router();
  router.param("id", (req, res, next, id) => {
    req.params.id = positive(id);
    next();
  });

  // ?category=WINDING|SIM_RACING &region= &q=(이름 검색) &bbox=swLat,swLng,neLat,neLng &limit(1~200)
  // bbox가 없으면 지역·검색 조건에 맞는 공개 스팟 전체(최대 200개)를 돌려준다 — "내 주변 찾기"는
  // 이 전체 목록을 받아 브라우저에서 Haversine 거리로 정렬한다. bbox는 지도 이동 시 보이는 영역만 다시 불러올 때 쓴다.
  router.get("/", async (req, res) => {
    const category = req.query.category === undefined ? "" : oneOf(req.query.category, CATEGORIES, "카테고리를 확인해주세요.");
    const region = req.query.region === undefined ? "" : text(req.query.region, 100, false);
    const q = req.query.q === undefined ? "" : text(req.query.q, 100, false);
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const limit = req.query.limit === undefined ? 200 : positive(req.query.limit);
    if (limit > 200) fail(400, "한 번에 200개까지만 조회할 수 있습니다.");
    const bbox = bboxParam(req.query.bbox);
    const { rows } = await db.query(
      `${spotSelect} ${spotFrom}
       WHERE s.deleted_at IS NULL AND s.publication='PUBLISHED'
       AND ($1='' OR s.category=$1) AND ($2='' OR s.region=$2) AND ($3='' OR s.name ILIKE $4)
       AND ($5::float8 IS NULL OR s.latitude BETWEEN $5 AND $6)
       AND ($7::float8 IS NULL OR s.longitude BETWEEN $7 AND $8)
       ORDER BY s.id LIMIT $9`,
      [category, region, q, like, bbox?.swLat ?? null, bbox?.neLat ?? null, bbox?.swLng ?? null, bbox?.neLng ?? null, limit],
    );
    res.json({ spots: rows });
  });

  router.get("/:id", async (req, res) => {
    const { rows } = await db.query(`${spotSelect} ${spotFrom} WHERE s.id=$1 AND s.deleted_at IS NULL AND s.publication='PUBLISHED'`, [req.params.id]);
    // 초안·비공개·삭제된 스팟은 없는 스팟과 구분하지 않는다.
    if (!rows.length) fail(404, "삭제되었거나 없는 스팟입니다.");
    res.json(rows[0]);
  });
  return router;
}

// --- 운영 API (app.js가 /api/board/admin/spots에 adminRouter보다 먼저 붙인다) ---

async function transaction(db, work) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23514") fail(400, "입력 내용을 확인해주세요.");
    throw error;
  } finally {
    client.release();
  }
}

const log = (client, entityId, action, before, after, actor, reason = null) =>
  client.query(
    `INSERT INTO content_admin_logs(entity_type,entity_id,action,before,after,reason,actor_id,actor_role)
     VALUES('SPOT',$1,$2,$3::jsonb,$4::jsonb,$5,$6,$7)`,
    [entityId, action, before && JSON.stringify(before), after && JSON.stringify(after), reason, actor.id, actor.role],
  );

const rowJson = "SELECT row_to_json(t) AS row FROM drive_spots t WHERE t.id=$1";
const STAFF_ID_FIELDS = ["createdBy", "updatedBy", "deletedBy"];
const staffIds = (row) =>
  row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k, STAFF_ID_FIELDS.includes(k) && v !== null ? Number(v) : v]));

export function spotsAdminRouter({ db, auth }) {
  const router = Router();
  router.use(auth, async (req, res, next) => {
    req.staff = await requireCurrentStaff(db, req.user, "MANAGER");
    next();
  });
  router.param("id", (req, res, next, id) => {
    req.params.id = positive(id);
    next();
  });

  // 감사 로그 조회. ?action &actorId &page. "/:id"보다 먼저 등록해야 한다(그렇지 않으면
  // "/logs"가 id 파라미터로 잘못 매칭되어 positive("logs")에서 400이 난다).
  router.get("/logs", async (req, res) => {
    const action = req.query.action === undefined ? "" : oneOf(req.query.action, ["CREATE", "UPDATE", "PUBLISH", "HIDE", "DELETE", "RESTORE"], "작업 종류를 확인해주세요.");
    const actorId = req.query.actorId === undefined ? null : positive(req.query.actorId);
    const page = positive(req.query.page ?? 1);
    const { rows } = await db.query(
      `WITH filtered AS (SELECT l.id,l.entity_type AS "entityType",l.entity_id AS "entityId",l.action,l.before,l.after,l.reason,
         l.actor_id AS "actorId",l.actor_role AS "actorRole",u.username AS "actorUsername",l.created_at AS "createdAt"
         FROM content_admin_logs l JOIN users u ON u.id=l.actor_id
         WHERE l.entity_type='SPOT' AND ($1='' OR l.action=$1) AND ($2::bigint IS NULL OR l.actor_id=$2))
       SELECT (SELECT count(*)::int FROM filtered) AS total,
       COALESCE((SELECT json_agg(item) FROM (SELECT * FROM filtered ORDER BY id DESC LIMIT 20 OFFSET $3) item),'[]'::json) AS items`,
      [action, actorId, (page - 1) * 20],
    );
    res.json({ ...rows[0], page, pageSize: 20 });
  });

  // 카테고리별 필수값은 V7 CHECK와 같다(API가 더 명확한 메시지로 먼저 걸러낸다).
  function spotInput(body) {
    const b = body ?? {};
    const category = oneOf(b.category, CATEGORIES, "카테고리(와인딩·심레이싱)를 선택해주세요.");
    const name = text(b.name, 100);
    const region = optionalText(b.region, 100);
    const address = text(b.address, 300);
    const latitude = coordinate(b.latitude, -90, 90, true);
    const longitude = coordinate(b.longitude, -180, 180, true);
    const description = optionalText(b.description, 2000);
    const imageUrl = webUrl(b.imageUrl, "대표 이미지 URL", false);

    let routeStart = null, routeEnd = null, distanceKm = null, durationMinutes = null, route = null, recommendedTime = null, caution = null;
    let businessHours = null, officialUrl = null, reservationUrl = null, facilityInfo = null, priceInfo = null;

    if (category === "WINDING") {
      routeStart = text(b.routeStart, 100);
      routeEnd = text(b.routeEnd, 100);
      distanceKm = decimal(b.distanceKm, 0.1, 9999);
      durationMinutes = b.durationMinutes === undefined || b.durationMinutes === null || b.durationMinutes === ""
        ? null
        : positive(b.durationMinutes);
      route = routeGeometry(b.route);
      recommendedTime = optionalText(b.recommendedTime, 200);
      caution = optionalText(b.caution, 500);
    } else {
      businessHours = text(b.businessHours, 200);
      officialUrl = webUrl(b.officialUrl, "공식 홈페이지 URL", false);
      reservationUrl = webUrl(b.reservationUrl, "예약 링크 URL", false);
      facilityInfo = optionalText(b.facilityInfo, 500);
      priceInfo = optionalText(b.priceInfo, 500);
    }
    return [
      category, name, region, address, latitude, longitude, description, imageUrl,
      routeStart, routeEnd, distanceKm, durationMinutes, route, recommendedTime, caution,
      businessHours, officialUrl, reservationUrl, facilityInfo, priceInfo,
    ];
  }

  const adminSpot = async (client, id) =>
    staffIds((await client.query(`${spotSelect}${adminColumns} ${spotFrom} WHERE s.id=$1`, [id])).rows[0]);
  const lockSpot = async (client, id) => {
    const before = (await client.query(`${rowJson} FOR UPDATE`, [id])).rows[0]?.row;
    if (!before) fail(404, "스팟을 찾을 수 없습니다.");
    return before;
  };
  const spotRow = async (client, id) => (await client.query(rowJson, [id])).rows[0].row;

  // ?q(이름·주소 검색) &category &region &publication &deleted=exclude|include|only &page
  router.get("/", async (req, res) => {
    const q = req.query.q === undefined ? "" : text(req.query.q, 100, false);
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    const category = req.query.category === undefined ? "" : oneOf(req.query.category, CATEGORIES, "카테고리를 확인해주세요.");
    const region = req.query.region === undefined ? "" : text(req.query.region, 100, false);
    const publication = req.query.publication === undefined ? "" : oneOf(req.query.publication, PUBLICATIONS, "공개 상태를 확인해주세요.");
    const deleted = req.query.deleted ?? "exclude";
    oneOf(deleted, ["exclude", "include", "only"], "삭제 필터를 확인해주세요.");
    const page = positive(req.query.page ?? 1);
    const { rows } = await db.query(
      `WITH filtered AS (${spotSelect}${adminColumns} ${spotFrom}
         WHERE (s.name ILIKE $1 OR s.address ILIKE $1) AND ($2='' OR s.category=$2) AND ($3='' OR s.region=$3)
         AND ($4='' OR s.publication=$4)
         AND ($5='include' OR ($5='exclude' AND s.deleted_at IS NULL) OR ($5='only' AND s.deleted_at IS NOT NULL)))
       SELECT (SELECT count(*)::int FROM filtered) AS total,
       COALESCE((SELECT json_agg(item) FROM (SELECT * FROM filtered ORDER BY id DESC LIMIT 20 OFFSET $6) item),'[]'::json) AS items`,
      [like, category, region, publication, deleted, (page - 1) * 20],
    );
    const { total, items } = rows[0];
    res.json({ total, page, pageSize: 20, items: items.map(staffIds) });
  });

  router.get("/:id", async (req, res) => {
    const spot = await adminSpot(db, req.params.id);
    if (!spot) fail(404, "스팟을 찾을 수 없습니다.");
    res.json(spot);
  });

  // 등록. 기본은 초안(DRAFT)이고 {publish: true}면 바로 공개한다.
  router.post("/", async (req, res) => {
    const publish = req.body?.publish === true;
    const spot = await transaction(db, async (client) => {
      const values = spotInput(req.body);
      const { rows } = await client.query(
        `INSERT INTO drive_spots(category,name,region,address,latitude,longitude,description,image_url,
           route_start,route_end,distance_km,duration_minutes,route,recommended_time,caution,
           business_hours,official_url,reservation_url,facility_info,price_info,
           created_by,publication,published_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22::text,
           CASE WHEN $22::text='PUBLISHED' THEN NOW() END) RETURNING id`,
        [...values, req.staff.id, publish ? "PUBLISHED" : "DRAFT"],
      );
      const id = rows[0].id;
      await log(client, id, "CREATE", null, await spotRow(client, id), req.staff);
      return adminSpot(client, id);
    });
    res.status(201).json(spot);
  });

  // 전체 교체(공개 상태는 바꾸지 않는다 — publish/hide로만).
  router.put("/:id", async (req, res) => {
    const spot = await transaction(db, async (client) => {
      const before = await lockSpot(client, req.params.id);
      if (before.deleted_at) fail(409, "삭제된 스팟은 복원한 뒤 수정할 수 있습니다.");
      const values = spotInput(req.body);
      await client.query(
        `UPDATE drive_spots SET category=$1,name=$2,region=$3,address=$4,latitude=$5,longitude=$6,description=$7,image_url=$8,
           route_start=$9,route_end=$10,distance_km=$11,duration_minutes=$12,route=$13::jsonb,recommended_time=$14,caution=$15,
           business_hours=$16,official_url=$17,reservation_url=$18,facility_info=$19,price_info=$20,
           updated_by=$22,updated_at=NOW()
         WHERE id=$21`,
        [...values, req.params.id, req.staff.id],
      );
      await log(client, req.params.id, "UPDATE", before, await spotRow(client, req.params.id), req.staff);
      return adminSpot(client, req.params.id);
    });
    res.json(spot);
  });

  // 공개 상태 전환. publish: 초안·비공개 → 공개, hide: 공개 → 비공개.
  for (const [path, action, from, to] of [
    ["publish", "PUBLISH", ["DRAFT", "HIDDEN"], "PUBLISHED"],
    ["hide", "HIDE", ["PUBLISHED"], "HIDDEN"],
  ]) {
    router.post(`/:id/${path}`, async (req, res) => {
      const reason = optionalText(req.body?.reason, 500);
      const spot = await transaction(db, async (client) => {
        const before = await lockSpot(client, req.params.id);
        if (before.deleted_at) fail(409, "삭제된 스팟은 공개 상태를 바꿀 수 없습니다.");
        if (!from.includes(before.publication))
          fail(409, to === "PUBLISHED" ? "이미 공개된 스팟입니다." : "공개 중인 스팟만 비공개로 바꿀 수 있습니다.");
        await client.query(
          `UPDATE drive_spots SET publication=$2::text,published_at=COALESCE(published_at,CASE WHEN $2::text='PUBLISHED' THEN NOW() END),
             updated_by=$3,updated_at=NOW() WHERE id=$1`,
          [req.params.id, to, req.staff.id],
        );
        await log(client, req.params.id, action, before, await spotRow(client, req.params.id), req.staff, reason);
        return adminSpot(client, req.params.id);
      });
      res.json(spot);
    });
  }

  // 삭제·복원은 ADMIN 전용(현재 DB 역할로 다시 확인). 소프트 삭제라 연결된 후기 글은 남고 공개 API에서만 사라진다.
  router.delete("/:id", async (req, res) => {
    const reason = optionalText(req.body?.reason, 500);
    await transaction(db, async (client) => {
      const admin = await requireCurrentStaff(client, req.user, "ADMIN");
      const before = await lockSpot(client, req.params.id);
      if (before.deleted_at) fail(409, "이미 삭제된 스팟입니다.");
      await client.query("UPDATE drive_spots SET deleted_at=NOW(),deleted_by=$2 WHERE id=$1", [req.params.id, admin.id]);
      await log(client, req.params.id, "DELETE", before, await spotRow(client, req.params.id), admin, reason);
    });
    res.status(204).end();
  });

  router.post("/:id/restore", async (req, res) => {
    const reason = optionalText(req.body?.reason, 500);
    const spot = await transaction(db, async (client) => {
      const admin = await requireCurrentStaff(client, req.user, "ADMIN");
      const before = await lockSpot(client, req.params.id);
      if (!before.deleted_at) fail(409, "삭제되지 않은 스팟입니다.");
      await client.query(
        "UPDATE drive_spots SET deleted_at=NULL,deleted_by=NULL,updated_by=$2,updated_at=NOW() WHERE id=$1",
        [req.params.id, admin.id],
      );
      await log(client, req.params.id, "RESTORE", before, await spotRow(client, req.params.id), admin, reason);
      return adminSpot(client, req.params.id);
    });
    res.json(spot);
  });
  return router;
}
