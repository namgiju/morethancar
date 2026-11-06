import { Router } from "express";
import { fail, positive, text } from "./validation.js";
import { requireCurrentAdmin } from "./admin-access.js";
import { displayNameSql, isWithdrawnSql, publicMemberId, unlessWithdrawnSql } from "./member-display.js";
import { rateLimiter } from "./rate-limit.js";

// 모터스포츠 일정 댓글(답글 1단계)과 댓글 신고 — Flyway V12.
// 게시판 댓글(community.js)과 같은 규칙: 읽기는 누구나, 쓰기·신고는 로그인 회원, 삭제는 작성자 또는 ADMIN.
// 댓글을 다는 일정은 공개(PUBLISHED)·삭제되지 않은 일정뿐이다(초안·비공개 일정은 없는 일정과 같게 404).
export const COMMENT_MAX = 1000;
const AUTHOR_DELETED = "삭제된 댓글입니다.";
const ADMIN_DELETED = "관리자에 의해 삭제된 댓글입니다.";

const publicEvent = "SELECT id FROM motorsport_events WHERE id=$1 AND deleted_at IS NULL AND publication='PUBLISHED'";

export function motorsportCommentsRouter({ db, auth }) {
  const router = Router();
  const commentLimiter = rateLimiter({ windowMs: 60_000, max: 20, message: "댓글 작성이 너무 잦아요. 잠시 후 다시 시도해주세요." });
  const reportLimiter = rateLimiter({ windowMs: 60_000, max: 10, message: "신고가 너무 잦아요. 잠시 후 다시 시도해주세요." });
  router.param("id", (req, res, next, id) => {
    req.params.id = positive(id);
    next();
  });
  router.param("commentId", (req, res, next, id) => {
    req.params.commentId = positive(id);
    next();
  });

  async function requireEvent(id) {
    const { rows } = await db.query(publicEvent, [id]);
    if (!rows.length) fail(404, "삭제되었거나 없는 일정입니다.");
  }

  // 삭제된 댓글은 원문 대신 삭제 문구를 내려준다(답글이 있으면 자리를 지켜야 해서 목록에는 남긴다).
  router.get("/events/:id/comments", async (req, res) => {
    await requireEvent(req.params.id);
    const { rows } = await db.query(
      `SELECT c.id,c.parent_id AS "parentId",c.deleted,
        CASE WHEN NOT c.deleted THEN c.content WHEN c.deleted_reason='ADMIN' THEN '${ADMIN_DELETED}' ELSE '${AUTHOR_DELETED}' END AS content,
        ${unlessWithdrawnSql("u", "c.author_id")} AS "authorId",${displayNameSql("u")} AS username,
        ${isWithdrawnSql("u")} AS "authorWithdrawn",c.created_at AS "createdAt"
       FROM motorsport_event_comments c JOIN users u ON u.id=c.author_id WHERE c.event_id=$1 ORDER BY c.id`,
      [req.params.id],
    );
    res.json(rows.map((c) => ({ ...c, authorId: publicMemberId(c.authorId) })));
  });

  // 답글은 같은 일정의, 삭제되지 않은 최상위 댓글에만 달 수 있다. 일정 확인·부모 확인·저장을 한 문장으로 처리한다.
  router.post("/events/:id/comments", auth, commentLimiter, async (req, res) => {
    const content = text(req.body?.content, COMMENT_MAX);
    const parent = req.body?.parentId == null ? null : positive(req.body.parentId);
    const { rows } = await db.query(
      `WITH target AS (
        SELECT e.id FROM motorsport_events e
        LEFT JOIN motorsport_event_comments pc ON pc.id=$4 AND pc.event_id=e.id AND pc.parent_id IS NULL AND NOT pc.deleted
        WHERE e.id=$1 AND e.deleted_at IS NULL AND e.publication='PUBLISHED' AND ($4::int IS NULL OR pc.id IS NOT NULL)
      ) INSERT INTO motorsport_event_comments(event_id,author_id,content,parent_id) SELECT id,$2,$3,$4 FROM target RETURNING id`,
      [req.params.id, req.user.id, content, parent],
    );
    if (!rows.length) fail(404, "일정 또는 답글을 달 댓글을 찾을 수 없어요.");
    res.status(201).json(rows[0]);
  });

  // 작성자는 사유 없이, ADMIN은 다른 회원의 댓글을 사유와 함께 지운다(사유·삭제자는 댓글 행에 남는다).
  router.delete("/comments/:commentId", auth, async (req, res) => {
    await deleteEventComment(db, req.user, req.params.commentId, req.body?.reason);
    res.json({ ok: true });
  });

  router.post("/comments/:commentId/report", auth, reportLimiter, async (req, res) => {
    const reason = text(req.body?.reason, 500);
    const { rows: found } = await db.query(
      `SELECT c.author_id FROM motorsport_event_comments c JOIN motorsport_events e ON e.id=c.event_id
       WHERE c.id=$1 AND NOT c.deleted AND e.deleted_at IS NULL AND e.publication='PUBLISHED'`,
      [req.params.commentId],
    );
    if (!found.length) fail(404, "삭제되었거나 없는 댓글입니다.");
    if (Number(found[0].author_id) === req.user.id) fail(400, "내 댓글은 신고할 수 없어요.");
    const { rows } = await db.query(
      `INSERT INTO motorsport_comment_reports(user_id,comment_id,reason) VALUES($1,$2,$3)
       ON CONFLICT(user_id,comment_id) DO UPDATE SET reason=EXCLUDED.reason WHERE motorsport_comment_reports.status='pending' RETURNING id`,
      [req.user.id, req.params.commentId, reason],
    );
    if (!rows.length) fail(409, "이미 처리된 신고입니다.");
    res.status(201).json(rows[0]);
  });
  return router;
}

// 행 잠금으로 동시 삭제·신고 처리와 겹치지 않게 한다. client를 받으면 호출자의 트랜잭션 안에서 실행한다.
export async function deleteEventComment(db, user, id, reason, client = null) {
  const own = !client;
  const c = client ?? (await db.connect());
  try {
    if (own) await c.query("BEGIN");
    const { rows } = await c.query("SELECT id,author_id,deleted FROM motorsport_event_comments WHERE id=$1 FOR UPDATE", [id]);
    const target = rows[0];
    if (!target || target.deleted) fail(404, "삭제되었거나 없는 댓글입니다.");
    const moderation = Number(target.author_id) !== user.id;
    if (moderation) {
      const admin = await requireCurrentAdmin(c, user);
      const note = text(reason, 500);
      await c.query(
        `UPDATE motorsport_event_comments SET deleted=true,deleted_reason='ADMIN',deleted_by=$2,deleted_at=NOW(),moderation_note=$3 WHERE id=$1`,
        [id, admin.id, note],
      );
    } else {
      await c.query(
        `UPDATE motorsport_event_comments SET deleted=true,deleted_reason='AUTHOR',deleted_by=$2,deleted_at=NOW() WHERE id=$1`,
        [id, user.id],
      );
    }
    if (own) await c.query("COMMIT");
  } catch (error) {
    if (own) await c.query("ROLLBACK");
    throw error;
  } finally {
    if (own) c.release();
  }
}

// /api/board/admin/event-comment-reports — ADMIN 전용(게시글 신고 /api/board/admin/reports와 같은 권한).
export function eventCommentReportsAdminRouter({ db, auth }) {
  const router = Router();
  router.use(auth, async (req, res, next) => {
    await requireCurrentAdmin(db, req.user);
    next();
  });

  router.get("/", async (req, res) => {
    const raw = text(req.query.q ?? "", 100, false);
    const q = `%${raw.replace(/[\\%_]/g, "\\$&")}%`;
    const page = positive(req.query.page ?? 1);
    const status = text(req.query.status ?? "", 20, false);
    if (!["", "pending", "resolved", "dismissed"].includes(status)) fail(400, "신고 상태를 확인해주세요.");
    // 신고 검토용이라 삭제된 댓글도 원문을 함께 준다.
    const { rows } = await db.query(
      `WITH filtered AS (
        SELECT r.id,r.comment_id AS "commentId",c.event_id AS "eventId",e.title AS "eventTitle",c.content,
          ${displayNameSql("au")} AS author,${displayNameSql("u")} AS reporter,r.reason,r.status,
          c.deleted AS "commentDeleted",c.deleted_reason AS "deletedReason",c.moderation_note AS "moderationNote",
          r.created_at AS "createdAt",r.reviewed_at AS "reviewedAt",
          CASE WHEN a.id IS NULL THEN NULL ELSE ${displayNameSql("a")} END AS reviewer,r.resolution_note AS "resolutionNote"
        FROM motorsport_comment_reports r
        JOIN motorsport_event_comments c ON c.id=r.comment_id
        JOIN motorsport_events e ON e.id=c.event_id
        JOIN users u ON u.id=r.user_id JOIN users au ON au.id=c.author_id
        LEFT JOIN users a ON a.id=r.reviewed_by
        WHERE (e.title ILIKE $1 OR c.content ILIKE $1 OR ${displayNameSql("u")} ILIKE $1 OR ${displayNameSql("au")} ILIKE $1 OR r.reason ILIKE $1)
          AND ($2='' OR r.status=$2)
      )
      SELECT (SELECT count(*)::int FROM filtered) AS total,
      COALESCE((SELECT json_agg(item) FROM (SELECT * FROM filtered ORDER BY id DESC LIMIT 20 OFFSET $3) item),'[]'::json) AS items`,
      [q, status, (page - 1) * 20],
    );
    res.json({ ...rows[0], page, pageSize: 20 });
  });

  // 처리 결과 기록. deleteComment=true면 같은 트랜잭션에서 댓글을 관리자 삭제한다(사유 = 검토 메모).
  router.patch("/:id", async (req, res) => {
    const id = positive(req.params.id);
    const status = req.body?.status;
    const note = text(req.body?.note, 500);
    const deleteComment = req.body?.deleteComment === true;
    if (!["resolved", "dismissed"].includes(status)) fail(400, "처리 결과를 선택해주세요.");
    if (deleteComment && status !== "resolved") fail(400, "댓글 삭제는 처리 완료와 함께만 할 수 있어요.");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `UPDATE motorsport_comment_reports SET status=$2,resolution_note=$3,reviewed_by=$4,reviewed_at=NOW()
         WHERE id=$1 AND status='pending' RETURNING id,comment_id,status,reviewed_at AS "reviewedAt"`,
        [id, status, note, req.user.id],
      );
      if (!rows.length) {
        const found = await client.query("SELECT id FROM motorsport_comment_reports WHERE id=$1", [id]);
        if (!found.rows.length) fail(404, "신고를 찾을 수 없습니다.");
        fail(409, "이미 처리된 신고입니다. 목록을 새로고침해주세요.");
      }
      if (deleteComment) {
        const { rows: target } = await client.query("SELECT deleted FROM motorsport_event_comments WHERE id=$1", [rows[0].comment_id]);
        // 이미 지워진 댓글이면 신고 처리만 기록한다.
        if (target.length && !target[0].deleted) await deleteEventComment(db, req.user, rows[0].comment_id, note, client);
      }
      await client.query("COMMIT");
      const { comment_id: _comment, ...result } = rows[0];
      res.json(result);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  return router;
}
