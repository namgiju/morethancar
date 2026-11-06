import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

// 일정 댓글(V12)·댓글 신고 API. 실제 DB 대신 SQL을 보고 답하는 가짜 DB로 권한·검증·쓰기 문장을 확인한다.
const sessions = {
  u: { id: 7, username: "member", role: "USER" },
  o: { id: 8, username: "other", role: "USER" },
  a: { id: 1, username: "admin", role: "ADMIN" },
  d: { id: 2, username: "demoted", role: "ADMIN" },
};
const dbRoles = { 7: "USER", 8: "USER", 1: "ADMIN", 2: "USER" };

// state.event: 공개 일정 여부, state.comment: 댓글 행(작성자·삭제 여부), state.report: 검토 대기 신고 여부
function fakeDb(state = {}) {
  const s = { event: true, comment: { id: 11, author_id: 7, deleted: false }, report: true, ...state };
  const log = [];
  const run = (sql, values = []) => {
    log.push({ sql, values });
    if (sql.startsWith("SELECT COALESCE(auth_version")) return { rows: [{ version: 0, status: "ACTIVE", suspended_until: null }] };
    if (sql.startsWith("SELECT id,username,role")) {
      const id = values[0];
      return { rows: dbRoles[id] ? [{ id, username: "db-user", role: dbRoles[id], status: "ACTIVE", suspended_until: null }] : [] };
    }
    if (sql.startsWith("SELECT id FROM motorsport_events")) return { rows: s.event ? [{ id: values[0] }] : [] };
    if (sql.includes("FROM motorsport_event_comments c JOIN users u"))
      return { rows: [{ id: 11, parentId: null, deleted: false, content: "화이팅", authorId: "7", username: "member", authorWithdrawn: false, createdAt: "2026-11-06T00:00:00Z" }] };
    if (sql.includes("INSERT INTO motorsport_event_comments")) return { rows: s.event ? [{ id: 12 }] : [] };
    if (sql.startsWith("SELECT id,author_id,deleted FROM motorsport_event_comments")) return { rows: s.comment ? [s.comment] : [] };
    if (sql.startsWith("SELECT c.author_id FROM motorsport_event_comments")) return { rows: s.comment && !s.comment.deleted ? [{ author_id: s.comment.author_id }] : [] };
    if (sql.includes("INSERT INTO motorsport_comment_reports")) return { rows: s.report ? [{ id: 3 }] : [] };
    if (sql.includes("UPDATE motorsport_comment_reports")) return { rows: s.report ? [{ id: values[0], comment_id: 11, status: values[1], reviewedAt: "now" }] : [] };
    if (sql.startsWith("SELECT id FROM motorsport_comment_reports")) return { rows: [{ id: values[0] }] };
    if (sql.startsWith("SELECT deleted FROM motorsport_event_comments")) return { rows: [{ deleted: s.comment?.deleted ?? false }] };
    if (sql.includes("SELECT (SELECT count(*)::int FROM filtered)")) return { rows: [{ total: 0, items: [] }] };
    return { rows: [], rowCount: 0 };
  };
  return {
    log,
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

const writes = (db) => db.log.filter(({ sql }) => /^\s*(WITH|INSERT|UPDATE|DELETE)/.test(sql) && /INSERT|UPDATE|DELETE/.test(sql));

test("comment list is public for a published event and 404 otherwise", async (t) => {
  const req = await start(t, fakeDb());
  const res = await req(null, "/api/board/motorsport/events/5/comments");
  assert.equal(res.status, 200);
  const [c] = await res.json();
  assert.equal(c.authorId, 7);
  assert.equal(c.content, "화이팅");

  const hidden = await start(t, fakeDb({ event: false }));
  assert.equal((await hidden(null, "/api/board/motorsport/events/5/comments")).status, 404);
});

test("writing needs login, validates content, and only targets published events", async (t) => {
  const db = fakeDb();
  const req = await start(t, db);
  assert.equal((await req(null, "/api/board/motorsport/events/5/comments", "POST", { content: "hi" })).status, 401);
  assert.equal((await req("u", "/api/board/motorsport/events/5/comments", "POST", { content: "   " })).status, 400);
  assert.equal((await req("u", "/api/board/motorsport/events/5/comments", "POST", { content: "x".repeat(1001) })).status, 400);
  assert.equal((await req("u", "/api/board/motorsport/events/5/comments", "POST", { content: "hi", parentId: "abc" })).status, 400);
  assert.equal(writes(db).length, 0);

  const ok = await req("u", "/api/board/motorsport/events/5/comments", "POST", { content: "<b>화이팅</b>", parentId: 11 });
  assert.equal(ok.status, 201);
  const insert = writes(db)[0];
  assert.match(insert.sql, /publication='PUBLISHED'/);
  assert.match(insert.sql, /pc\.parent_id IS NULL AND NOT pc\.deleted/);
  assert.deepEqual(insert.values, [5, 7, "화이팅", 11]);

  const gone = await start(t, fakeDb({ event: false }));
  assert.equal((await gone("u", "/api/board/motorsport/events/5/comments", "POST", { content: "hi" })).status, 404);
});

test("author deletes own comment without a reason; others need a current ADMIN and a reason", async (t) => {
  let db = fakeDb();
  let req = await start(t, db);
  assert.equal((await req("u", "/api/board/motorsport/comments/11", "DELETE")).status, 200);
  assert.match(writes(db)[0].sql, /deleted_reason='AUTHOR'/);

  db = fakeDb();
  req = await start(t, db);
  assert.equal((await req("o", "/api/board/motorsport/comments/11", "DELETE")).status, 403);
  assert.equal((await req("d", "/api/board/motorsport/comments/11", "DELETE", { reason: "x" })).status, 403);
  assert.equal((await req("a", "/api/board/motorsport/comments/11", "DELETE")).status, 400);
  assert.equal(writes(db).length, 0);
  assert.equal((await req("a", "/api/board/motorsport/comments/11", "DELETE", { reason: "욕설" })).status, 200);
  const update = writes(db)[0];
  assert.match(update.sql, /deleted_reason='ADMIN'/);
  assert.deepEqual(update.values, [11, 1, "욕설"]);

  req = await start(t, fakeDb({ comment: { id: 11, author_id: 7, deleted: true } }));
  assert.equal((await req("u", "/api/board/motorsport/comments/11", "DELETE")).status, 404);
});

test("reporting: login, not own comment, reason required, processed report is 409", async (t) => {
  const db = fakeDb();
  const req = await start(t, db);
  assert.equal((await req(null, "/api/board/motorsport/comments/11/report", "POST", { reason: "spam" })).status, 401);
  assert.equal((await req("o", "/api/board/motorsport/comments/11/report", "POST", {})).status, 400);
  assert.equal((await req("u", "/api/board/motorsport/comments/11/report", "POST", { reason: "spam" })).status, 400);
  assert.equal((await req("o", "/api/board/motorsport/comments/11/report", "POST", { reason: "spam" })).status, 201);
  assert.deepEqual(writes(db).at(-1).values, [8, 11, "spam"]);

  const done = await start(t, fakeDb({ report: false }));
  assert.equal((await done("o", "/api/board/motorsport/comments/11/report", "POST", { reason: "spam" })).status, 409);
  const gone = await start(t, fakeDb({ comment: null }));
  assert.equal((await gone("o", "/api/board/motorsport/comments/11/report", "POST", { reason: "spam" })).status, 404);
});

test("admin report review is ADMIN-only and can delete the comment in the same transaction", async (t) => {
  const db = fakeDb({ comment: { id: 11, author_id: 8, deleted: false } });
  const req = await start(t, db);
  const path = "/api/board/admin/event-comment-reports";
  assert.equal((await req(null, path)).status, 401);
  assert.equal((await req("u", path)).status, 403);
  assert.equal((await req("d", path)).status, 403);
  assert.equal((await req("a", path)).status, 200);
  assert.equal((await req("a", `${path}?status=bogus`)).status, 400);

  assert.equal((await req("u", `${path}/3`, "PATCH", { status: "resolved", note: "ok" })).status, 403);
  assert.equal((await req("a", `${path}/3`, "PATCH", { status: "dismissed", note: "ok", deleteComment: true })).status, 400);
  assert.equal(writes(db).length, 0);

  const res = await req("a", `${path}/3`, "PATCH", { status: "resolved", note: "욕설 확인", deleteComment: true });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(await res.json()).sort(), ["id", "reviewedAt", "status"]);
  const [review, del] = writes(db);
  assert.match(review.sql, /UPDATE motorsport_comment_reports/);
  assert.match(del.sql, /deleted_reason='ADMIN'/);
  assert.deepEqual(del.values, [11, 1, "욕설 확인"]);
  assert.ok(db.log.some(({ sql }) => sql === "BEGIN") && db.log.some(({ sql }) => sql === "COMMIT"));

  const done = await start(t, fakeDb({ report: false }));
  assert.equal((await done("a", `${path}/3`, "PATCH", { status: "resolved", note: "x" })).status, 409);
});
