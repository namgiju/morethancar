import { deleteContent } from './moderation.js';
import { displayNameSql, isWithdrawnSql, publicMemberId, unlessWithdrawnSql } from "./member-display.js";
import { existingImageIdsSql, publicImageSql } from "./image-references.js";
import { Router } from "express";
import { VERIFIED_OWNER_BADGE } from "./badges.js";

import { fail, text, positive, integer } from "./validation.js";
import { isoDate, kstToday } from "./motorsport.js";
import { validateOwnedImages } from "./owned-images.js";
import { rateLimiter } from "./rate-limit.js";

const categories = ["free", "maintenance", "parts", "drive"];
export function decodeImage(value) {
  if (typeof value !== "string" || value.length > 4200000)
    fail(400, "사진은 3MB 이하로 올려주세요.");
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      value,
    );
  if (!match) fail(400, "JPG, PNG, WebP 사진만 올릴 수 있어요.");
  const data = Buffer.from(match[2], "base64");
  const mime = match[1];
  const valid =
    mime === "image/jpeg"
      ? data.length >= 4 &&
        data[0] === 255 &&
        data[1] === 216 &&
        data[2] === 255
      : mime === "image/png"
        ? data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : data.toString("ascii", 0, 4) === "RIFF" &&
          data.toString("ascii", 8, 12) === "WEBP";
  if (!valid || !data.length || data.length > 3 * 1024 * 1024)
    fail(400, "지원하지 않거나 너무 큰 사진입니다.");
  return { mime, data };
}
// 탈퇴 작성자의 글은 남기되 이름·회원 id·차량(차고 링크로 다시 식별된다)은 공개하지 않는다(member-display.js).
const postSelect = `SELECT p.id,p.title,p.content,${unlessWithdrawnSql("u", "p.author_id")} AS "authorId",${displayNameSql("u")} AS username,
 ${isWithdrawnSql("u")} AS "authorWithdrawn",
 ${unlessWithdrawnSql("u", "p.vehicle_id")} AS "vehicleId",
 ${unlessWithdrawnSql("u", "(SELECT json_build_object('id',v.id,'model',v.model,'year',v.year,'verified',v.verified,'imageId',v.image_id,'archived',v.archived_at IS NOT NULL) FROM owner_vehicles v WHERE v.id=p.vehicle_id AND v.owner_id=p.author_id)")} AS "linkedVehicle",
 ${unlessWithdrawnSql("u", `(SELECT json_build_object('id',pp.id,'brand',pp.brand,'name',pp.name,'spec',pp.spec,'installedOn',pp.installed_on,'removedOn',pp.removed_on,
   'installMileage',pp.install_mileage,'removeMileage',pp.remove_mileage,'hasPhoto',cardinality(${existingImageIdsSql("pp.image_ids")})>0)
   FROM vehicle_parts pp JOIN owner_vehicles pv ON pv.id=pp.vehicle_id WHERE pp.id=p.part_id AND pp.is_public AND pv.owner_id=p.author_id)`)} AS "linkedPart",
 CASE WHEN p.author_id=$1 THEN p.part_id END AS "partId",
 p.motorsport_event_id AS "motorsportEventId",
 (SELECT json_build_object('id',e.id,'kind',e.kind,'title',e.title,'startsOn',to_char(e.starts_on,'YYYY-MM-DD'),'endsOn',to_char(e.ends_on,'YYYY-MM-DD'))
  FROM motorsport_events e WHERE e.id=p.motorsport_event_id AND e.deleted_at IS NULL AND e.publication='PUBLISHED') AS "linkedMotorsportEvent",
 p.created_at AS "createdAt",p.updated_at AS "updatedAt",p.category,p.vehicle,${existingImageIdsSql("p.image_ids")} AS "imageIds",p.views,
 (SELECT COUNT(*)::int FROM board_comments c WHERE c.post_id=p.id AND NOT c.deleted) AS "commentCount",
 (SELECT COUNT(*)::int FROM board_likes l WHERE l.post_id=p.id) AS "likeCount",
 EXISTS(SELECT 1 FROM board_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked,
 EXISTS(SELECT 1 FROM board_bookmarks b WHERE b.post_id=p.id AND b.user_id=$1) AS bookmarked,
 ${unlessWithdrawnSql("u", "(SELECT model FROM owner_vehicles v WHERE v.owner_id=p.author_id AND v.archived_at IS NULL ORDER BY v.id LIMIT 1)")} AS "ownerVehicle"
 FROM (SELECT * FROM board_posts WHERE NOT deleted) p JOIN users u ON u.id=p.author_id`;
const asPost = (row) => ({ ...row, authorId: publicMemberId(row.authorId) });

// Asia/Seoul(KST, UTC+9는 서머타임이 없어 상수로 계산해도 안전하다) 기준 오늘 00:00을
// 해당 UTC 시각으로 변환한다. period=today 필터에 사용한다.
function todayStartKst() {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const kstMidnightAsUtc = Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
  );
  return new Date(kstMidnightAsUtc - KST_OFFSET_MS);
}
// period=week: 지금부터 최근 7일(rolling)을 되돌아본 시각. "이번 주 인기 이야기"에서 사용한다.
function weekAgo() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

export function communityRouter({ db, auth }) {
  const router = Router();
  // 스팸/스토리지 고갈을 막는 기본적인 계정당 rate limit. 정상적인 글쓰기/댓글 흐름은
  // 넉넉히 통과하도록 여유 있게 잡았다.
  const postLimiter = rateLimiter({ windowMs: 60_000, max: 10, message: "글 작성이 너무 잦아요. 잠시 후 다시 시도해주세요." });
  const commentLimiter = rateLimiter({ windowMs: 60_000, max: 20, message: "댓글 작성이 너무 잦아요. 잠시 후 다시 시도해주세요." });
  const guestbookLimiter = rateLimiter({ windowMs: 60_000, max: 10, message: "방명록 작성이 너무 잦아요. 잠시 후 다시 시도해주세요." });
  const imageLimiter = rateLimiter({ windowMs: 60_000, max: 20, message: "사진 업로드가 너무 잦아요. 잠시 후 다시 시도해주세요." });
  const reportLimiter = rateLimiter({ windowMs: 60_000, max: 10, message: "신고가 너무 잦아요. 잠시 후 다시 시도해주세요." });
  // 조회수는 비로그인도 올릴 수 있어 로그인 여부와 관계없이 IP 단위로 제한한다(조회수 부풀리기 방지).
  const viewLimiter = rateLimiter({ windowMs: 60_000, max: 60, by: "ip" });
  router.param("id", (req, res, next, id) => {
    req.params.id = positive(id);
    next();
  });
  router.param("commentId", (req, res, next, id) => {
    req.params.commentId = positive(id);
    next();
  });
  router.param("recordId", (req, res, next, id) => {
    req.params.recordId = positive(id);
    next();
  });
  router.param("partId", (req, res, next, id) => {
    req.params.partId = positive(id);
    next();
  });
  const exists = async (id) => {
    const { rows } = await db.query(
      "SELECT id,author_id FROM board_posts WHERE id=$1 AND NOT deleted",
      [id],
    );
    if (!rows.length) fail(404, "삭제되었거나 없는 글입니다.");
    return rows[0];
  };
  const images = (ids, userId) => validateOwnedImages(db, ids, userId);
  // keep: 수정 중인 글에 이미 연결된 차량·부품. 보관한 차량(과 그 부품)은 새로 연결할 수 없지만 기존 연결은 유지한다.
  // 반환값 끝(9번째)은 부품 id. 부품만 고르면 차량은 그 부품의 차량으로 채운다.
  async function postInput(body, userId, keep = {}) {
    const keepVehicleId = keep.vehicleId ?? null;
    const {
      title,
      content,
      category = "free",
      vehicle = "",
      imageIds = [],
    } = body ?? {};
    if (!categories.includes(category))
      fail(400, "게시판 분류를 선택해주세요.");
    let linked = null;
    if (body?.vehicleId != null && body.vehicleId !== "") {
      const { rows } = await db.query(
        "SELECT id,model,archived_at IS NOT NULL AS archived FROM owner_vehicles WHERE id=$1 AND owner_id=$2",
        [positive(body.vehicleId), userId],
      );
      if (!rows.length) fail(403, "본인 차량만 연결할 수 있어요.");
      if (rows[0].archived && rows[0].id !== keepVehicleId) fail(400, "보관한 차량은 새 글에 연결할 수 없어요.");
      linked = rows[0];
    }
    // 부품 후기 연결(MVP 단계 4): 본인 차량의 부품만(403), 차량을 함께 고르면 같은 차량의 부품이어야 한다(400).
    // 비공개 부품도 연결할 수 있지만 글에는 장착 정보가 보이지 않는다(postSelect linkedPart).
    let partId = null;
    if (body?.partId != null && body.partId !== "") {
      const { rows } = await db.query(
        `SELECT pp.id,pv.id AS "vehicleId",pv.model,pv.archived_at IS NOT NULL AS archived
         FROM vehicle_parts pp JOIN owner_vehicles pv ON pv.id=pp.vehicle_id WHERE pp.id=$1 AND pv.owner_id=$2`,
        [positive(body.partId), userId],
      );
      if (!rows.length) fail(403, "본인 차량의 부품만 연결할 수 있어요.");
      const part = rows[0];
      if (part.archived && part.id !== (keep.partId ?? null)) fail(400, "보관한 차량의 부품은 새 글에 연결할 수 없어요.");
      if (linked && linked.id !== part.vehicleId) fail(400, "선택한 차량의 부품이 아니에요.");
      linked ??= { id: part.vehicleId, model: part.model };
      partId = part.id;
    }
    // 공개(PUBLISHED)·미삭제 일정만 연결할 수 있다 — 존재하지 않거나 초안/비공개/삭제된
    // 일정 id는 motorsportRouter의 공개 조회와 같은 조건으로 거부한다.
    let motorsportEventId = null;
    if (body?.motorsportEventId != null && body.motorsportEventId !== "") {
      const { rows } = await db.query(
        "SELECT id FROM motorsport_events WHERE id=$1 AND deleted_at IS NULL AND publication='PUBLISHED'",
        [positive(body.motorsportEventId)],
      );
      if (!rows.length) fail(400, "연결할 일정을 찾을 수 없습니다.");
      motorsportEventId = rows[0].id;
    }
    return [
      text(title, 150),
      text(content, 5000),
      userId,
      category,
      linked ? linked.model : text(vehicle, 100, false),
      await images(imageIds, userId),
      linked?.id ?? null,
      motorsportEventId,
      partId,
    ];
  }
  router.post("/images", auth, imageLimiter, async (req, res) => {
    const { mime, data } = decodeImage(req.body?.data);
    const { rows } = await db.query(
      "INSERT INTO community_images(owner_id,mime,data) VALUES($1,$2,$3) RETURNING id",
      [req.user.id, mime, data],
    );
    res
      .status(201)
      .json({ id: rows[0].id, url: `/api/board/images/${rows[0].id}` });
  });
  router.get("/images/:id", async (req, res) => {
    // 공개 데이터가 참조하는 사진만 누구에게나 준다(image-references.js). 소유자는 작성 중 미리보기로,
    // 관리자(DB 기준 역할)는 신고 처리로 볼 수 있다. 정지·탈퇴 세션은 app.js 인증에서 이미 null이다.
    // 삭제된 글에만 쓰였거나 어디에도 쓰이지 않는 사진은 id를 알아도 404로, 없는 사진과 구분하지 않는다.
    // 캐시(MVP 단계 6-b): 공개 사진은 1시간 공유 캐시를 허용한다 — 비공개로 바뀌거나 지워져도 이미 받은
    // 브라우저·중간 캐시에는 최대 1시간 남을 수 있다(합의된 정책). 소유자·관리자라서 보이는 비공개 사진은
    // private, no-store. 404는 공통 미들웨어(app.js)의 no-store 그대로. nginx는 이 경로만 upstream 값을 통과시킨다.
    // 공개 여부는 한 번만 계산한다(publicImageSql은 참조 테이블마다 EXISTS라 두 번 쓰면 두 배로 든다).
    const { rows } = await db.query(
      `SELECT x.mime,x.data,x.public FROM (
         SELECT i.mime,i.data,i.owner_id,${publicImageSql("i")} AS public FROM community_images i WHERE i.id=$1
       ) x WHERE x.public OR x.owner_id=$2 OR EXISTS(SELECT 1 FROM users a WHERE a.id=$2 AND a.role='ADMIN')`,
      [req.params.id, req.user?.id ?? null],
    );
    if (!rows.length) fail(404, "사진을 찾을 수 없습니다.");
    res
      .set("X-Content-Type-Options", "nosniff")
      .set("Cache-Control", rows[0].public ? "public, max-age=3600" : "private, no-store")
      .type(rows[0].mime)
      .send(rows[0].data);
  });
  router.get("/posts", async (req, res) => {
    const {
      q = "",
      category = "",
      sort = "latest",
      scope = "",
      vehicle = "",
      period = "",
    } = req.query;
    const query = text(q, 100, false),
      model = text(vehicle, 100, false);
    if (category && !categories.includes(category))
      fail(400, "올바른 분류를 선택해주세요.");
    if (
      !["latest", "popular"].includes(sort) ||
      !["", "mine", "bookmarks", "commented"].includes(scope)
    )
      fail(400, "올바른 정렬을 선택해주세요.");
    if (period && !["today", "week"].includes(period))
      fail(400, "지원하지 않는 기간입니다.");
    if (scope && !req.user) fail(401, "로그인이 필요합니다.");
    // 모터스포츠 상세(/motorsport/{id})의 "연결된 이야기" 목록이 쓴다. linkedPostCount
    // (board-service/src/motorsport.js)와 똑같은 조건(motorsport_event_id=X AND NOT deleted)
    // 이라 두 값이 항상 일치한다.
    const motorsportEventId =
      req.query.motorsportEventId === undefined ? null : positive(req.query.motorsportEventId);
    const page = positive(req.query.page ?? 1);
    const limit =
      req.query.limit === undefined
        ? 100
        : integer(Number(req.query.limit), 1, 100);
    const values = [
      req.user?.id ?? null,
      `%${query.replace(/[\\%_]/g, "\\$&")}%`,
      category,
      `%${model.replace(/[\\%_]/g, "\\$&")}%`,
      period === "today" ? todayStartKst() : period === "week" ? weekAgo() : null,
      motorsportEventId,
    ];
    // 작성자 검색은 화면에 보이는 이름으로만 한다(탈퇴 회원의 원래 아이디로 글을 찾을 수 없게).
    let where = ` WHERE (p.title ILIKE $2 OR p.content ILIKE $2 OR ${displayNameSql("u")} ILIKE $2) AND ($3='' OR p.category=$3) AND p.vehicle ILIKE $4 AND ($5::timestamptz IS NULL OR p.created_at>=$5) AND ($6::int IS NULL OR p.motorsport_event_id=$6)`;
    if (scope === "mine") where += " AND p.author_id=$1";
    if (scope === "bookmarks")
      where +=
        " AND EXISTS(SELECT 1 FROM board_bookmarks b WHERE b.post_id=p.id AND b.user_id=$1)";
    if (scope === "commented")
      where +=
        " AND EXISTS(SELECT 1 FROM board_comments c WHERE c.post_id=p.id AND c.author_id=$1 AND NOT c.deleted)";
    const order =
      sort === "popular"
        ? '"likeCount" DESC,"commentCount" DESC,p.id DESC'
        : "p.id DESC";
    const { rows } = await db.query(
      postSelect + where + ` ORDER BY ${order} LIMIT $7 OFFSET $8`,
      [...values, limit, (page - 1) * limit],
    );
    res.json(rows.map(asPost));
  });
  router.post("/posts", auth, postLimiter, async (req, res) => {
    const values = await postInput(req.body, req.user.id);
    const { rows } = await db.query(
      `INSERT INTO board_posts(title,content,author_id,category,vehicle,image_ids,vehicle_id,motorsport_event_id,part_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,title,content,category,author_id AS "authorId"`,
      values,
    );
    res.status(201).json(asPost(rows[0]));
  });
  router.get("/posts/:id", async (req, res) => {
    const { rows } = await db.query(postSelect + " WHERE p.id=$2", [
      req.user?.id ?? null,
      req.params.id,
    ]);
    if (!rows.length) fail(404, "삭제되었거나 없는 글입니다.");
    res.json(asPost(rows[0]));
  });
  router.post("/posts/:id/view", viewLimiter, async (req, res) => {
    const { rows } = await db.query(
      "UPDATE board_posts SET views=views+1 WHERE id=$1 AND NOT deleted RETURNING views",
      [req.params.id],
    );
    if (!rows.length) fail(404, "삭제되었거나 없는 글입니다.");
    res.json(rows[0]);
  });
  // vehicleId·partId·motorsportEventId는 본문에 있을 때만 바꾸고(null이면 해제), 없으면 유지한다.
  // 부품을 고르면 차량도 그 부품의 차량으로 바뀐다. 차량만 다른 차량(또는 해제)으로 바꾸면 기존 부품 연결은 해제한다.
  router.put("/posts/:id", auth, async (req, res) => {
    const body = req.body ?? {};
    const hasVehicle = Object.hasOwn(body, "vehicleId"), hasPart = Object.hasOwn(body, "partId");
    const current = hasVehicle || hasPart
      ? (await db.query("SELECT vehicle_id,part_id FROM board_posts WHERE id=$1 AND author_id=$2 AND NOT deleted", [req.params.id, req.user.id])).rows[0]
      : null;
    const values = await postInput(req.body, req.user.id, { vehicleId: current?.vehicle_id ?? null, partId: current?.part_id ?? null });
    const { rows } = await db.query(
      `UPDATE board_posts SET title=$1,content=$2,category=$4,
      vehicle=CASE WHEN NOT $11 AND vehicle_id IS NOT NULL THEN vehicle ELSE $5 END,
      image_ids=$6,vehicle_id=CASE WHEN $11 THEN $7 ELSE vehicle_id END,
      motorsport_event_id=CASE WHEN $12 THEN $8 ELSE motorsport_event_id END,
      part_id=CASE WHEN $13 THEN $9::int WHEN $11 AND $7::int IS DISTINCT FROM vehicle_id THEN NULL ELSE part_id END,updated_at=NOW()
      WHERE id=$10 AND author_id=$3 AND NOT deleted RETURNING id,category`,
      [
        ...values,
        req.params.id,
        hasVehicle || values[8] != null,
        Object.hasOwn(body, "motorsportEventId"),
        hasPart,
      ],
    );
    if (!rows.length) fail(403, "본인이 작성한 글만 수정할 수 있어요.");
    res.json(rows[0]);
  });
  router.delete("/posts/:id", auth, async (req, res) => {
    await deleteContent(db, req.user, 'post', req.params.id, req.body?.reason);
    res.json({ ok: true });
  });
  for (const [route, table] of [
    ["like", "board_likes"],
    ["bookmark", "board_bookmarks"],
  ]) {
    router.put(`/posts/:id/${route}`, auth, async (req, res) => {
      await exists(req.params.id);
      if (typeof req.body?.active !== "boolean")
        fail(400, "상태를 선택해주세요.");
      if (req.body.active)
        await db.query(
          `INSERT INTO ${table}(post_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
          [req.params.id, req.user.id],
        );
      else
        await db.query(`DELETE FROM ${table} WHERE post_id=$1 AND user_id=$2`, [
          req.params.id,
          req.user.id,
        ]);
      res.json({ active: req.body.active });
    });
  }
  router.get("/posts/:id/comments", async (req, res) => {
    await exists(req.params.id);
    const { rows } = await db.query(
      `SELECT c.id,c.content,c.deleted,c.parent_id AS "parentId",${unlessWithdrawnSql("u", "c.author_id")} AS "authorId",
      ${displayNameSql("u")} AS username,${isWithdrawnSql("u")} AS "authorWithdrawn",c.created_at AS "createdAt"
      FROM board_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 ORDER BY c.id`,
      [req.params.id],
    );
    res.json(rows.map((c) => ({ ...c, authorId: publicMemberId(c.authorId) })));
  });
  router.post("/posts/:id/comments", auth, commentLimiter, async (req, res) => {
    const content = text(req.body?.content, 2000);
    const parent =
      req.body?.parentId == null ? null : positive(req.body.parentId);
    // Insert, parent validation and notification are one atomic statement.
    const { rows } = await db.query(
      `WITH target AS (
      SELECT p.id,p.author_id,pc.author_id AS parent_author FROM board_posts p
      LEFT JOIN board_comments pc ON pc.id=$4 AND pc.post_id=p.id AND pc.parent_id IS NULL AND NOT pc.deleted
      WHERE p.id=$1 AND NOT p.deleted AND ($4::int IS NULL OR pc.id IS NOT NULL)
    ), inserted AS (
      INSERT INTO board_comments(post_id,author_id,content,parent_id) SELECT id,$2,$3,$4 FROM target RETURNING *
    ), notified AS (
      INSERT INTO community_notifications(user_id,actor_id,post_id,kind)
      SELECT DISTINCT recipient,$2,i.post_id,'comment' FROM inserted i CROSS JOIN target t
      CROSS JOIN LATERAL unnest(ARRAY[t.author_id,t.parent_author]) recipient
      WHERE recipient IS NOT NULL AND recipient<>$2
    ) SELECT id FROM inserted`,
      [req.params.id, req.user.id, content, parent],
    );
    if (!rows.length) fail(404, "글 또는 답글을 달 댓글을 찾을 수 없어요.");
    res.status(201).json(rows[0]);
  });
  router.delete("/comments/:commentId", auth, async (req, res) => {
    await deleteContent(db, req.user, 'comment', req.params.commentId, req.body?.reason);
    res.json({ ok: true });
  });
  router.post("/posts/:id/report", auth, reportLimiter, async (req, res) => {
    await exists(req.params.id);
    const reason = text(req.body?.reason, 500);
    const { rows } = await db.query(
      `INSERT INTO community_reports(user_id,post_id,reason) VALUES($1,$2,$3)
      ON CONFLICT(user_id,post_id) DO UPDATE SET reason=EXCLUDED.reason WHERE community_reports.status='pending' RETURNING id`,
      [req.user.id, req.params.id, reason],
    );
    if (!rows.length) fail(409, "이미 처리된 신고입니다.");
    res.status(201).json(rows[0]);
  });
  router.get("/reports", auth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT r.id,r.reason,r.status,r.created_at AS "createdAt",p.id AS "postId",p.title,p.category
      FROM community_reports r JOIN board_posts p ON p.id=r.post_id WHERE r.user_id=$1 AND NOT p.deleted ORDER BY r.id DESC LIMIT 100`,
      [req.user.id],
    );
    res.json(rows);
  });
  router.get("/notifications", auth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT n.id,n.post_id AS "postId",n.is_read AS "isRead",n.created_at AS "createdAt",p.title,p.category,${displayNameSql("u")} AS username,n.kind
      FROM community_notifications n JOIN board_posts p ON p.id=n.post_id JOIN users u ON u.id=n.actor_id
      WHERE n.user_id=$1 AND NOT p.deleted ORDER BY n.id DESC LIMIT 100`,
      [req.user.id],
    );
    res.json(rows);
  });
  router.put("/notifications/read", auth, async (req, res) => {
    await db.query(
      "UPDATE community_notifications SET is_read=true WHERE user_id=$1",
      [req.user.id],
    );
    res.json({ ok: true });
  });
  // Personal settings are always bound to the shared session, never to role or body.userId.
  router.put("/profile", auth, async (req, res) => {
    const bio = text(req.body?.bio, 300, false);
    const avatar = req.body?.avatarImageId == null ? null : positive(req.body.avatarImageId);
    const cover = req.body?.coverImageId == null ? null : positive(req.body.coverImageId);
    await images([avatar, cover].filter(Boolean), req.user.id);
    await db.query(`INSERT INTO member_profiles(user_id,bio,avatar_image_id,cover_image_id)
      VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE
      SET bio=EXCLUDED.bio,avatar_image_id=EXCLUDED.avatar_image_id,cover_image_id=EXCLUDED.cover_image_id`,
      [req.user.id, bio, avatar, cover]);
    res.json({ok:true});
  });
  // 보관한 차량은 대표 차량이 될 수 없다. FOR SHARE로 보관 처리(차량 행 FOR UPDATE)와 순서를 맞춘다 —
  // 보관이 먼저 커밋되면 보관 여부를 다시 보고 거부하고, 이쪽이 먼저면 보관이 대표 차량을 해제한다.
  router.put("/profile/representative-vehicle", auth, async (req, res) => {
    const id = positive(req.body?.vehicleId);
    const {rowCount} = await db.query(`INSERT INTO member_profiles(user_id,representative_vehicle_id)
      SELECT owner_id,id FROM owner_vehicles WHERE id=$1 AND owner_id=$2 AND archived_at IS NULL FOR SHARE
      ON CONFLICT(user_id) DO UPDATE SET representative_vehicle_id=EXCLUDED.representative_vehicle_id`, [id,req.user.id]);
    if (!rowCount) {
      const own = await db.query("SELECT 1 FROM owner_vehicles WHERE id=$1 AND owner_id=$2", [id, req.user.id]);
      if (own.rows.length) fail(400, "보관한 차량은 대표 차량으로 설정할 수 없어요.");
      fail(403, "본인 차량만 대표 차량으로 설정할 수 있어요.");
    }
    res.json({ok:true});
  });
  router.get("/members/:id/guestbook", async (req, res) => {
    const before = req.query.before === undefined ? null : positive(req.query.before);
    // 탈퇴 회원의 차고(와 그 방명록)는 공개하지 않는다. 다른 회원 차고에 남긴 방명록은 "탈퇴한 회원"으로 보인다.
    const owner = await db.query(`SELECT id,(SELECT COUNT(*)::int FROM garage_guestbook WHERE owner_id=$1) AS total FROM users u WHERE id=$1 AND NOT ${isWithdrawnSql("u")}`,[req.params.id]);
    if (!owner.rows.length) fail(404, "회원을 찾을 수 없어요.");
    const {rows} = await db.query(`SELECT g.id,g.owner_id AS "ownerId",${unlessWithdrawnSql("u", "g.author_id")} AS "authorId",
      ${displayNameSql("u")} AS username,${isWithdrawnSql("u")} AS "authorWithdrawn",g.content,g.created_at AS "createdAt"
      FROM garage_guestbook g JOIN users u ON u.id=g.author_id
      WHERE g.owner_id=$1 AND ($2::int IS NULL OR g.id<$2) ORDER BY g.id DESC LIMIT 21`,[req.params.id,before]);
    const items=rows.slice(0,20).map(r=>({...r,ownerId:Number(r.ownerId),authorId:publicMemberId(r.authorId)}));
    res.json({items,total:owner.rows[0].total,nextCursor:rows.length>20?items.at(-1).id:null});
  });
  router.post("/members/:id/guestbook", auth, guestbookLimiter, async (req, res) => {
    const content = text(req.body?.content,1000);
    const {rows} = await db.query(`INSERT INTO garage_guestbook(owner_id,author_id,content)
      SELECT id,$2,$3 FROM users u WHERE id=$1 AND NOT ${isWithdrawnSql("u")} RETURNING id`,[req.params.id,req.user.id,content]);
    if (!rows.length) fail(404,"회원을 찾을 수 없어요.");
    res.status(201).json(rows[0]);
  });
  router.delete("/members/:id/guestbook/:entryId", auth, async (req, res) => {
    const {rowCount} = await db.query(`DELETE FROM garage_guestbook WHERE id=$1 AND owner_id=$2 AND (author_id=$3 OR owner_id=$3)`,[positive(req.params.entryId),req.params.id,req.user.id]);
    if (!rowCount) fail(403,"작성자 또는 방명록 주인만 삭제할 수 있어요.");
    res.json({ok:true});
  });
  router.get("/members/:id", async (req, res) => {
    const { rows } = await db.query(
      `SELECT u.id,u.username,u.created_at AS "joinedAt",
       (SELECT COUNT(*)::int FROM board_posts p WHERE p.author_id=u.id AND NOT p.deleted) AS "postCount",
       (SELECT COUNT(*)::int FROM board_comments c WHERE c.author_id=u.id AND NOT c.deleted AND EXISTS(SELECT 1 FROM board_posts p WHERE p.id=c.post_id AND NOT p.deleted)) AS "commentCount",
       (SELECT COUNT(*)::int FROM board_likes l JOIN board_posts p ON p.id=l.post_id WHERE p.author_id=u.id AND NOT p.deleted) AS "receivedLikes"
       FROM users u WHERE u.id=$1 AND NOT ${isWithdrawnSql("u")}`,
      [req.params.id],
    );
    // 탈퇴 회원의 공개 프로필(가입일·활동 수·차고·프로필 사진)은 보여 주지 않는다.
    if (!rows.length) fail(404, "회원을 찾을 수 없어요.");
    const posts = await db.query(
      postSelect + " WHERE p.author_id=$2 ORDER BY p.id DESC LIMIT 30",
      [req.user?.id ?? null, req.params.id],
    );
    // 공개 프로필에는 등록증·차량번호·심사 정보를 포함하지 않는다.
    const vehicles = await db.query(
      `SELECT id,manufacturer,model,year,trim,nickname,image_id AS "imageId",verified,archived_at AS "archivedAt"
       FROM owner_vehicles WHERE owner_id=$1 ORDER BY archived_at IS NULL DESC,verified DESC,id ASC`,
      [req.params.id],
    );
    const settings = (await db.query(`SELECT bio,avatar_image_id AS "avatarImageId",cover_image_id AS "coverImageId",
      representative_vehicle_id AS "representativeVehicleId" FROM member_profiles WHERE user_id=$1`,[req.params.id])).rows[0] || {};
    // 인증 오너 인장은 지금 보유한(보관하지 않은) 인증 차량으로만 계산한다. 대표 차량도 보관 차량은 쓰지 않는다.
    const current = vehicles.rows.filter((v) => !v.archivedAt);
    const verified = current.some((v) => v.verified);
    res.json({
      ...rows[0],
      id: Number(rows[0].id),
      ...settings,
      avatarUrl: settings.avatarImageId ? `/api/board/images/${settings.avatarImageId}` : null,
      vehicles: vehicles.rows,
      representativeVehicle: current.find(v=>v.id===settings.representativeVehicleId) ?? current[0] ?? null,
      verified,
      // 실제 인증 상태에서 계산하는 표시용 인장. 획득 이력은 생성하지 않는다.
      badges: verified ? [{ ...VERIFIED_OWNER_BADGE }] : [],
      posts: posts.rows.map(asPost),
    });
  });
  // 차종별 게시판 1차 구현: board_posts.vehicle은 자유 텍스트라 owner_vehicles/vehicles와
  // FK로 묶지 않고 단순 집계만 한다. 정규화는 추후 과제로 남긴다.
  router.get("/vehicles/popular", async (req, res) => {
    const limit =
      req.query.limit === undefined
        ? 8
        : integer(Number(req.query.limit), 1, 50);
    const { rows } = await db.query(
      `SELECT vehicle, COUNT(*)::int AS "postCount" FROM board_posts
      WHERE NOT deleted AND vehicle IS NOT NULL AND vehicle<>'' GROUP BY vehicle
      ORDER BY "postCount" DESC, vehicle ASC LIMIT $1`,
      [limit],
    );
    res.json(rows);
  });
  // 홈 Hero 하단 서비스 지표. 실제 가입 회원/등록 차량/거래 완료 부품/게시글 수만 집계하며,
  // 이벤트 기능은 아직 없어 "커뮤니티 게시글"로 대체한다. 새 테이블이나 통계 시스템은 만들지 않는다.
  router.get("/stats/summary", async (req, res) => {
    const { rows } = await db.query(
      `SELECT
       (SELECT COUNT(*)::int FROM users u WHERE NOT ${isWithdrawnSql("u")}) AS "memberCount",
       (SELECT COUNT(*)::int FROM owner_vehicles) AS "vehicleCount",
       (SELECT COUNT(*)::int FROM parts_listings WHERE status='sold') AS "soldPartsCount",
       (SELECT COUNT(*)::int FROM board_posts WHERE NOT deleted) AS "postCount"`,
    );
    res.json(rows[0]);
  });
  // 홈 "REV.CC 인기 게시판" 전용 최소 집계. 4개 고정 카테고리(자유/정비/부품/드라이브)의
  // 게시글 수·최근 7일 게시글 수·누적 추천 수만 세며, 새로운 추천 시스템은 만들지 않는다.
  router.get("/categories/summary", async (req, res) => {
    const { rows } = await db.query(
      `SELECT c.category,
       COUNT(p.id)::int AS "postCount",
       COUNT(p.id) FILTER (WHERE p.created_at>=$1)::int AS "recentPostCount",
       COALESCE(SUM(pl.likes),0)::int AS "likeCount"
       FROM (VALUES ('free'),('maintenance'),('parts'),('drive')) AS c(category)
       LEFT JOIN board_posts p ON p.category=c.category AND NOT p.deleted
       LEFT JOIN (SELECT post_id, COUNT(*) AS likes FROM board_likes GROUP BY post_id) pl ON pl.post_id=p.id
       GROUP BY c.category
       ORDER BY "recentPostCount" DESC,"likeCount" DESC,"postCount" DESC`,
      [weekAgo()],
    );
    res.json(rows);
  });
  // Personal garage: identity comes only from the shared Redis session, including ADMIN.
  // Keep the public /garage?owner=... API for community member profiles.
  router.get("/garage/mine", auth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT v.id,v.owner_id AS "ownerId",u.username,v.manufacturer,v.model,v.year,v.trim,v.bio,
       v.nickname,v.image_id AS "imageId",v.verified,v.verification_status AS "verificationStatus",v.archived_at AS "archivedAt",
       (SELECT COUNT(*)::int FROM vehicle_records r WHERE r.vehicle_id=v.id) AS "recordCount"
       FROM owner_vehicles v JOIN users u ON u.id=v.owner_id
       WHERE v.owner_id=$1 ORDER BY v.id DESC`,
      [req.user.id],
    );
    res.json(rows.map((v) => ({ ...v, ownerId: Number(v.ownerId) })));
  });
  router.get("/garage", async (req, res) => {
    const owner =
      req.query.owner === undefined ? null : positive(req.query.owner);
    const { rows } = await db.query(
      `SELECT v.id,v.owner_id AS "ownerId",u.username,v.model,v.year,v.trim,v.bio,v.image_id AS "imageId",
      (SELECT COUNT(*)::int FROM vehicle_records r WHERE r.vehicle_id=v.id) AS "recordCount"
      FROM owner_vehicles v JOIN users u ON u.id=v.owner_id WHERE ($1::bigint IS NULL OR v.owner_id=$1) AND NOT ${isWithdrawnSql("u")} ORDER BY v.id DESC LIMIT 100`,
      [owner],
    );
    res.json(rows.map((v) => ({ ...v, ownerId: Number(v.ownerId) })));
  });
  // stored: 수정 시 잠그고 읽은 저장값({model, year}). Spring은 모델을 trim만 해서, 연식은 2100년까지 받아 저장한다.
  // 저장값을 그대로 다시 보낸 모델·연식은 board 검증(태그 정리·올해+1)을 거치지 않고 저장값 그대로 둔다 —
  // 그렇지 않으면 바꾸지 않은 값이 "변경"으로 판정되거나(409·인증 해제) 400이 나서 소개·사진도 고칠 수 없다.
  // 사용자가 실제로 바꾼 값은 지금처럼 검증한다.
  function vehicleFields(body, userId, stored) {
    const sameModel = stored && typeof body?.model === "string" && body.model.trim() === stored.model.trim();
    const model = sameModel ? stored.model : text(body?.model, 100),
      year = stored && body?.year === stored.year ? stored.year : integer(body?.year, 1900, new Date().getFullYear() + 1);
    const trim = text(body?.trim, 100, false),
      bio = text(body?.bio, 1000, false);
    const imageId = body?.imageId == null ? null : positive(body.imageId);
    return [userId, model, year, trim, bio, imageId];
  }
  async function vehicleInput(body, userId) {
    const values = vehicleFields(body, userId);
    if (values[5]) await images([values[5]], userId);
    return values;
  }
  router.post("/garage", auth, async (req, res) => {
    const { rows } = await db.query(
      `INSERT INTO owner_vehicles(owner_id,model,year,trim,bio,image_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      await vehicleInput(req.body, req.user.id),
    );
    res.status(201).json(rows[0]);
  });
  // 여기서 바꿀 수 있는 인증 핵심 필드는 모델·연식이다(제조사·번호판은 core API `PUT /api/garage/vehicles/:id`에서만 바꾼다).
  // 심사 중(PENDING)이면 바꿀 수 없고, 승인된 차량에서 바꾸면 인증을 해제한다. SET·WHERE의 컬럼은 수정 전 값이다.
  // 차량 행을 잠그고 최신 값을 읽은 뒤 같은 트랜잭션에서 UPDATE한다. core의 차량 수정·인증 신청·관리자 승인/반려도
  // 같은 행을 잠그므로(GarageVehicleRepository.findByIdForUpdate) 서로 기다렸다가 커밋된 값으로 판단한다.
  router.put("/garage/:id", auth, async (req, res) => {
    // 사진 소유 확인은 풀의 다른 연결을 쓰므로 트랜잭션 연결을 잡기 전에 끝낸다(동시 요청이 풀을 다 잡고 서로 기다리지 않게).
    const imageId = req.body?.imageId == null ? null : positive(req.body.imageId);
    if (imageId) await images([imageId], req.user.id);
    const client = await db.connect();
    let broken;
    try {
      await client.query("BEGIN");
      const stored = (await client.query(
        "SELECT model,year FROM owner_vehicles WHERE owner_id=$1 AND id=$2 FOR UPDATE",
        [req.user.id, req.params.id],
      )).rows[0];
      if (!stored) fail(403, "본인 차량만 수정할 수 있어요.");
      const values = vehicleFields(req.body, req.user.id, stored);
      const changed = "(model IS DISTINCT FROM $2 OR year IS DISTINCT FROM $3)";
      const approved = "(verified OR verification_status='APPROVED')";
      const { rows } = await client.query(
        `UPDATE owner_vehicles SET model=$2,year=$3,trim=$4,bio=$5,image_id=$6,updated_at=NOW(),
           verified=CASE WHEN ${changed} THEN false ELSE verified END,
           verification_status=CASE WHEN ${changed} AND ${approved} THEN NULL ELSE verification_status END,
           verified_at=CASE WHEN ${changed} AND ${approved} THEN NULL ELSE verified_at END
         WHERE owner_id=$1 AND id=$7 AND NOT (verification_status IS NOT DISTINCT FROM 'PENDING' AND ${changed})
         RETURNING id`,
        [...values, req.params.id],
      );
      if (!rows.length) fail(409, "인증 심사 중에는 차종·연식·번호판을 수정할 수 없어요.");
      await client.query("COMMIT");
      res.json(rows[0]);
    } catch (error) {
      // ROLLBACK까지 실패한 연결(끊김·시간 초과)은 풀에 돌려보내지 않고 버린다. 응답은 원래 오류로 한다.
      await client.query("ROLLBACK").catch((rollbackError) => { broken = rollbackError; });
      throw error;
    } finally {
      client.release(broken);
    }
  });
  // 보관(archived=true)·복원(false). 기록·연결 글·인증 이력은 그대로 두고 archived_at만 바꾼다.
  // 심사 중(PENDING) 차량은 보관할 수 없다(core의 인증 신청·승인과 같은 차량 행 잠금 안에서 판단).
  // 보관하면 그 차량을 가리키던 대표 차량 설정을 같은 트랜잭션에서 해제한다. 복원해도 대표 차량은 되돌리지 않는다.
  router.patch("/garage/:id/archive", auth, async (req, res) => {
    const archived = req.body?.archived;
    if (typeof archived !== "boolean") fail(400, "보관 여부를 확인해주세요.");
    const client = await db.connect();
    let broken;
    try {
      await client.query("BEGIN");
      const stored = (await client.query(
        "SELECT verification_status AS status FROM owner_vehicles WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [req.params.id, req.user.id],
      )).rows[0];
      if (!stored) fail(403, "본인 차량만 보관할 수 있어요.");
      if (archived && stored.status === "PENDING") fail(409, "인증 심사 중인 차량은 보관할 수 없어요.");
      const { rows } = await client.query(
        `UPDATE owner_vehicles SET archived_at=CASE WHEN $2 THEN COALESCE(archived_at,NOW()) END,updated_at=NOW()
         WHERE id=$1 RETURNING id,archived_at AS "archivedAt"`,
        [req.params.id, archived],
      );
      if (archived)
        await client.query(
          "UPDATE member_profiles SET representative_vehicle_id=NULL WHERE user_id=$1 AND representative_vehicle_id=$2",
          [req.user.id, req.params.id],
        );
      await client.query("COMMIT");
      res.json(rows[0]);
    } catch (error) {
      await client.query("ROLLBACK").catch((rollbackError) => { broken = rollbackError; });
      throw error;
    } finally {
      client.release(broken);
    }
  });
  router.delete("/garage/:id", auth, async (req, res) => {
    const { rowCount } = await db.query(
      "DELETE FROM owner_vehicles WHERE id=$1 AND owner_id=$2",
      [req.params.id, req.user.id],
    );
    if (!rowCount) fail(403, "본인 차량만 삭제할 수 있어요.");
    res.json({ ok: true });
  });
  router.get("/garage/:id", async (req, res) => {
    const { rows } = await db.query(
      `SELECT v.id,v.owner_id AS "ownerId",u.username,v.model,v.year,v.trim,v.bio,v.image_id AS "imageId",
       v.verified,v.verification_status AS "verificationStatus",v.archived_at AS "archivedAt",v.created_at AS "createdAt"
      FROM owner_vehicles v JOIN users u ON u.id=v.owner_id WHERE v.id=$1 AND NOT ${isWithdrawnSql("u")}`,
      [req.params.id],
    );
    if (!rows.length) fail(404, "차량을 찾을 수 없어요.");
    // 공개 응답에는 번호판·등록증을 넣지 않는다(SELECT에 없음). 심사 상태·비용은 소유자에게만.
    const owner = req.user?.id != null && String(req.user.id) === String(rows[0].ownerId);
    const { verificationStatus, ...vehicle } = rows[0];
    // 정비 기록 비용은 소유자에게만(2026-11-02 단계 4 — 이전에는 누구에게나 내려갔다).
    const records = await db.query(
      `SELECT id,kind,title,content,mileage,${owner ? "cost," : ""}recorded_on::text AS date FROM vehicle_records WHERE vehicle_id=$1 ORDER BY recorded_on DESC,id DESC`,
      [req.params.id],
    );
    // 부품: 소유자에게는 비공개 부품과 비용까지, 그 외에는 공개 부품만 비용 없이 내려준다.
    // 증빙은 저장하지 않고 사진이 있으면 "사진 첨부"로 계산만 한다(hasPhoto). 현재 장착(탈거일 없음) 먼저.
    const parts = await db.query(
      `SELECT id,brand,name,spec,installed_on::text AS "installedOn",removed_on::text AS "removedOn",
       install_mileage AS "installMileage",remove_mileage AS "removeMileage",${owner ? "cost," : ""}
       ${existingImageIdsSql("image_ids")} AS "imageIds",is_public AS "isPublic",cardinality(${existingImageIdsSql("image_ids")})>0 AS "hasPhoto"
       FROM vehicle_parts WHERE vehicle_id=$1 AND ($2 OR is_public)
       ORDER BY removed_on IS NULL DESC,installed_on DESC,id DESC`,
      [req.params.id, owner],
    );
    // 이 차량에 연결된 글(삭제 글 제외, 최근 50개). partId는 이 응답에서 보이는 부품일 때만 남긴다.
    const visibleParts = new Set(parts.rows.map((p) => p.id));
    const posts = await db.query(
      `SELECT id,title,category,created_at AS "createdAt",part_id AS "partId" FROM board_posts
       WHERE vehicle_id=$1 AND author_id=$2 AND NOT deleted ORDER BY id DESC LIMIT 50`,
      [req.params.id, rows[0].ownerId],
    );
    res.json({
      ...vehicle,
      ownerId: Number(rows[0].ownerId),
      ...(owner ? { verificationStatus } : {}),
      records: records.rows,
      parts: parts.rows,
      posts: posts.rows.map((p) => ({ ...p, partId: visibleParts.has(p.partId) ? p.partId : null })),
    });
  });
  router.post("/garage/:id/records", auth, async (req, res) => {
    const {
      kind,
      title,
      content = "",
      date,
      mileage = null,
      cost = null,
    } = req.body ?? {};
    if (!["maintenance", "tuning", "parts"].includes(kind))
      fail(400, "기록 종류를 선택해주세요.");
    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      fail(400, "올바른 날짜를 입력해주세요.");
    const values = [
      req.params.id,
      req.user.id,
      kind,
      text(title, 150),
      text(content, 2000, false),
      date,
      integer(mileage, 0, 2000000, true),
      integer(cost, 0, 2000000000, true),
    ];
    const { rows } = await db.query(
      `INSERT INTO vehicle_records(vehicle_id,kind,title,content,recorded_on,mileage,cost)
      SELECT id,$3,$4,$5,$6,$7,$8 FROM owner_vehicles WHERE id=$1 AND owner_id=$2 RETURNING id`,
      values,
    );
    if (!rows.length) fail(403, "본인 차량에만 기록을 추가할 수 있어요.");
    res.status(201).json(rows[0]);
  });
  router.delete("/garage/:id/records/:recordId", auth, async (req, res) => {
    const { rowCount } = await db.query(
      `DELETE FROM vehicle_records r USING owner_vehicles v WHERE r.vehicle_id=v.id AND v.owner_id=$1 AND v.id=$2 AND r.id=$3`,
      [req.user.id, req.params.id, req.params.recordId],
    );
    if (!rowCount) fail(403, "본인 차량의 기록만 삭제할 수 있어요.");
    res.json({ ok: true });
  });
  // 부품 장착·탈거 이력(MVP 단계 3). 현재 장착 = removed_on IS NULL. 탈거도 PUT으로 removedOn·removeMileage를 넣는다.
  // 날짜는 기록(records)과 같은 형식 검사를 하고, 한국 날짜(KST) 기준 미래 날짜는 받지 않는다.
  function partDate(value, optional, label) {
    if (optional && (value == null || value === "")) return null;
    if (isoDate(value, label) > kstToday()) fail(400, "미래 날짜는 입력할 수 없어요.");
    return value;
  }
  async function partInput(body, userId) {
    const installedOn = partDate(body?.installedOn, false, "장착일"),
      removedOn = partDate(body?.removedOn, true, "탈거일");
    const installMileage = integer(body?.installMileage ?? null, 0, 2000000, true),
      removeMileage = integer(body?.removeMileage ?? null, 0, 2000000, true);
    if (removedOn && removedOn < installedOn) fail(400, "탈거일은 장착일보다 빠를 수 없어요.");
    if (removeMileage != null && installMileage != null && removeMileage < installMileage)
      fail(400, "탈거 시 주행거리는 장착 시 주행거리보다 작을 수 없어요.");
    const isPublic = body?.isPublic ?? true;
    if (typeof isPublic !== "boolean") fail(400, "공개 여부를 확인해주세요.");
    return [
      text(body?.brand, 100),
      text(body?.name, 150),
      text(body?.spec, 200, false),
      installedOn,
      removedOn,
      installMileage,
      removeMileage,
      integer(body?.cost ?? null, 0, 2000000000, true),
      await images(body?.imageIds ?? [], userId),
      isPublic,
    ];
  }
  // 부품이 없을 때: 내 차량이면 404(다른 차량의 부품 경로 포함), 아니면 403.
  async function partMissing(vehicleId, userId) {
    const own = await db.query("SELECT 1 FROM owner_vehicles WHERE id=$1 AND owner_id=$2", [vehicleId, userId]);
    if (own.rows.length) fail(404, "부품을 찾을 수 없어요.");
    fail(403, "본인 차량의 부품만 관리할 수 있어요.");
  }
  router.post("/garage/:id/parts", auth, async (req, res) => {
    const values = await partInput(req.body, req.user.id);
    const { rows } = await db.query(
      `INSERT INTO vehicle_parts(vehicle_id,brand,name,spec,installed_on,removed_on,install_mileage,remove_mileage,cost,image_ids,is_public)
       SELECT id,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12 FROM owner_vehicles WHERE id=$1 AND owner_id=$2 RETURNING id`,
      [req.params.id, req.user.id, ...values],
    );
    if (!rows.length) fail(403, "본인 차량에만 부품을 추가할 수 있어요.");
    res.status(201).json(rows[0]);
  });
  // vehicle_id는 바꿀 수 없다(본문에서 받지 않는다).
  router.put("/garage/:id/parts/:partId", auth, async (req, res) => {
    const values = await partInput(req.body, req.user.id);
    const { rows } = await db.query(
      `UPDATE vehicle_parts p SET brand=$4,name=$5,spec=$6,installed_on=$7,removed_on=$8,install_mileage=$9,
       remove_mileage=$10,cost=$11,image_ids=$12,is_public=$13,updated_at=NOW()
       FROM owner_vehicles v WHERE p.vehicle_id=v.id AND v.id=$1 AND v.owner_id=$2 AND p.id=$3 RETURNING p.id`,
      [req.params.id, req.user.id, req.params.partId, ...values],
    );
    if (!rows.length) await partMissing(req.params.id, req.user.id);
    res.json(rows[0]);
  });
  // 부품을 지워도 그 사진은 남는다(미참조 이미지 정리는 회원 탈퇴에만 있다, 알려진 제한). 연결 글의 part_id는 NULL.
  router.delete("/garage/:id/parts/:partId", auth, async (req, res) => {
    const { rowCount } = await db.query(
      `DELETE FROM vehicle_parts p USING owner_vehicles v WHERE p.vehicle_id=v.id AND v.id=$1 AND v.owner_id=$2 AND p.id=$3`,
      [req.params.id, req.user.id, req.params.partId],
    );
    if (!rowCount) await partMissing(req.params.id, req.user.id);
    res.json({ ok: true });
  });
  return router;
}
