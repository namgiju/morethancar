// Run: scripts/run-board-system.sh scripts/motorsport-system.mjs (임시 PostgreSQL, Neon 미사용)
// 모터스포츠 일정 1단계(Flyway V6 + board-service motorsport.js)를 실제 PostgreSQL로 확인한다.
//  1. 호환성: V1~V5 데이터(회원·게시글, 허용값 밖의 옛 role 포함) 위에 V6가 적용되고 기존 글이 그대로다.
//  2. 권한: USER·강등된 세션 403, MANAGER는 등록·수정·공개·비공개·확인일, 다른 운영자 일정 수정 가능, 삭제·복원은 ADMIN만.
//     MANAGER는 기존 /api/board/admin(신고·회원·게시글 관리)에 들어가지 못한다.
//  3. 공개 API: PUBLISHED이고 삭제되지 않은 일정만. 기간 겹침·국내/해외·시간대 검사.
//  4. 감사 로그: 모든 변경에 수행자·당시 역할·대상·작업·시각과 전후 값이 남는다.
import assert from "node:assert/strict";
import { readdir, mkdir, copyFile, readFile } from "node:fs/promises";
import pg from "pg";
import { createApp } from "./src/app.js";
import { applyFlywayMigrations, assertIsolatedDatabase } from "./scripts/lib/flyway-migrations.mjs";
assertIsolatedDatabase();
const root = new pg.Pool();
const schema = `motorsport_test_${Date.now()}`;
let db, server;
const ADMIN = 201, MANAGER = 202, MANAGER2 = 203, MEMBER = 204, EX_MANAGER = 205, LEGACY = 206;
const tokens = { a: "a".repeat(43), m: "m".repeat(43), n: "n".repeat(43), u: "u".repeat(43), x: "x".repeat(43) };
const sessions = {
  [tokens.a]: { id: ADMIN, username: "admin", role: "ADMIN", version: 0 },
  [tokens.m]: { id: MANAGER, username: "manager", role: "MANAGER", version: 0 },
  [tokens.n]: { id: MANAGER2, username: "manager2", role: "MANAGER", version: 0 },
  [tokens.u]: { id: MEMBER, username: "member", role: "USER", version: 0 },
  // 세션은 아직 MANAGER지만 DB에서는 USER로 강등된 회원(같은 auth_version으로 남은 세션을 가정).
  [tokens.x]: { id: EX_MANAGER, username: "ex-manager", role: "MANAGER", version: 0 },
};
try {
  await root.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ options: `-c search_path=${schema}` });

  // --- 1. V1~V5만 적용한 DB에 기존 데이터를 넣고 V6를 따로 적용한다 ---
  await mkdir("/tmp/v1-v5", { recursive: true });
  for (const name of await readdir("./db-migration"))
    if (/^V[1-5]__/.test(name)) await copyFile(`./db-migration/${name}`, `/tmp/v1-v5/${name}`);
  assert.equal((await applyFlywayMigrations(db, "/tmp/v1-v5")).length, 5);
  await db.query(
    `INSERT INTO users(id,username,password,role) VALUES
     ($1,'admin','x','ADMIN'),($2,'manager','x','USER'),($3,'manager2','x','USER'),($4,'member','x','USER'),($5,'ex-manager','x','USER'),
     ($6,'legacy','x','LEGACY_ROLE')`, [ADMIN, MANAGER, MANAGER2, MEMBER, EX_MANAGER, LEGACY]);
  const oldPost = (await db.query(
    "INSERT INTO board_posts(title,content,author_id,category) VALUES('V6 이전 글','본문',$1,'free') RETURNING id", [MEMBER])).rows[0].id;
  const v6 = (await readdir("./db-migration")).find((n) => n.startsWith("V6__"));
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(await readFile(`./db-migration/${v6}`, "utf8"));
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  // V6 이후 마이그레이션도 적용한다(운영 API가 V9 자동 수집 컬럼을 읽는다).
  await mkdir("/tmp/v7-plus", { recursive: true });
  for (const name of await readdir("./db-migration"))
    if (/^V([7-9]|\d{2,})__/.test(name)) await copyFile(`./db-migration/${name}`, `/tmp/v7-plus/${name}`);
  await applyFlywayMigrations(db, "/tmp/v7-plus");
  // 옛 role 값은 NOT VALID라 그대로 남고, 새로 쓰는 값만 검사한다.
  assert.equal((await db.query("SELECT role FROM users WHERE id=$1", [LEGACY])).rows[0].role, "LEGACY_ROLE");
  await assert.rejects(db.query("UPDATE users SET role='OWNER' WHERE id=$1", [MEMBER]), /users_role_check/);
  await db.query("UPDATE users SET role='MANAGER' WHERE id IN ($1,$2)", [MANAGER, MANAGER2]);
  const kept = (await db.query("SELECT title,motorsport_event_id FROM board_posts WHERE id=$1", [oldPost])).rows[0];
  assert.deepEqual(kept, { title: "V6 이전 글", motorsport_event_id: null });

  server = createApp({ db, redis: { get: async (key) => JSON.stringify(sessions[key.slice("revcc:session:".length)] ?? null) } })
    .listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function req(path, { method = "GET", data, token, expected = 200 } = {}) {
    const r = await fetch(origin + path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: token ? `REVCC_SESSION=${token}` : "" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const text = await r.text();
    assert.equal(r.status, expected, `${method} ${path}: ${text}`);
    return text ? JSON.parse(text) : null;
  }
  const M = "/api/board/admin/motorsport";
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  const logCount = async () => Number((await db.query("SELECT count(*) FROM content_admin_logs")).rows[0].count);

  // 기존 게시글 API는 그대로이고 새 컬럼을 내보내지 않는다.
  const listed = (await req("/api/board/posts?limit=5")).find((p) => p.id === oldPost);
  assert.ok(listed && !("motorsport_event_id" in listed) && !("motorsportEventId" in listed));

  // --- 2. 권한 ---
  for (const token of [undefined, tokens.u, tokens.x]) {
    const expected = token ? 403 : 401;
    await req(`${M}/events`, { token, expected });
    await req(`${M}/venues`, { method: "POST", token, expected, data: { name: "x", country: "KR", timezone: "Asia/Seoul" } });
  }
  // MANAGER는 기존 관리자 API에 들어가지 못한다.
  for (const path of ["/api/board/admin/overview", "/api/board/admin/members", "/api/board/admin/reports", "/api/board/admin/logs"])
    await req(path, { token: tokens.m, expected: 403 });
  assert.equal(await logCount(), 0);

  const inje = await req(`${M}/venues`, { method: "POST", token: tokens.m, expected: 201,
    data: { name: "인제 스피디움", country: "KR", region: "강원 인제", timezone: "Asia/Seoul", officialUrl: "https://example.com/inje", latitude: 38.0, longitude: 128.3 } });
  const vegas = await req(`${M}/venues`, { method: "POST", token: tokens.m, expected: 201,
    data: { name: "Las Vegas Strip Circuit", country: "US", timezone: "America/Los_Angeles" } });
  await req(`${M}/venues`, { method: "POST", token: tokens.m, expected: 400, data: { name: "x", country: "KR", timezone: "Asia/Busan" } });
  const series = await req(`${M}/series`, { method: "POST", token: tokens.m, expected: 201,
    data: { code: "super-race", name: "슈퍼레이스", scope: "DOMESTIC", officialUrl: "https://example.com/sr" } });
  await req(`${M}/series`, { method: "POST", token: tokens.n, expected: 409, data: { code: "super-race", name: "중복", scope: "DOMESTIC" } });
  const f1 = await req(`${M}/series`, { method: "POST", token: tokens.a, expected: 201, data: { code: "f1", name: "Formula 1", scope: "INTERNATIONAL" } });

  // 월 경계를 걸치는 국내 일정(10/31~11/01), 시각 포함. 기본은 초안이라 공개 API에 안 보인다.
  const race = await req(`${M}/events`, { method: "POST", token: tokens.m, expected: 201, data: {
    seriesId: series.id, venueId: inje.id, kind: "RACE", title: "슈퍼레이스 최종전", startsOn: "2026-10-31", endsOn: "2026-11-01",
    startsAt: "2026-11-01T14:00:00+09:00", sourceUrl: "https://example.com/sr/2026", sourceName: "주최 측 공지", verifiedOn: "2026-10-01" } });
  assert.equal(race.publication, "DRAFT");
  assert.equal(race.startsAt, "2026-11-01T05:00:00Z");
  assert.equal(race.createdBy, MANAGER);
  assert.equal((await req("/api/board/motorsport/events?from=2026-10-01&to=2026-10-31")).events.length, 0);
  await req(`/api/board/motorsport/events/${race.id}`, { expected: 404 });

  // 해외 일정: 시작 시각의 "현지" 날짜로 기간을 검사한다(UTC 11/22 04:00 = 라스베이거스 11/21 20:00).
  const night = { seriesId: f1.id, venueId: vegas.id, kind: "RACE", title: "Las Vegas GP", startsOn: "2026-11-19", endsOn: "2026-11-21",
    startsAt: "2026-11-22T04:00:00Z", sourceUrl: "https://example.com/f1", sourceName: "F1 공식 캘린더", verifiedOn: "2026-10-01" };
  const vegasRace = await req(`${M}/events`, { method: "POST", token: tokens.n, expected: 201, data: { ...night, publish: true } });
  assert.equal(vegasRace.publication, "PUBLISHED");
  await req(`${M}/events`, { method: "POST", token: tokens.n, expected: 400, data: { ...night, endsOn: "2026-11-20" } });
  await req(`${M}/events`, { method: "POST", token: tokens.n, expected: 400, data: { ...night, verifiedOn: "2999-01-01" } });

  // 공개 → 공개 API에 보인다. 10월·11월 조회 모두에 걸치는 일정.
  await req(`${M}/events/${race.id}/publish`, { method: "POST", token: tokens.m });
  await req(`${M}/events/${race.id}/publish`, { method: "POST", token: tokens.m, expected: 409 });
  const oct = await req("/api/board/motorsport/events?from=2026-10-01&to=2026-10-31");
  const nov = await req("/api/board/motorsport/events?from=2026-11-01&to=2026-11-30");
  assert.deepEqual(oct.events.map((e) => e.id), [race.id]);
  assert.deepEqual(nov.events.map((e) => e.id), [race.id, vegasRace.id]);
  assert.equal(nov.events[1].venue.timezone, "America/Los_Angeles");
  assert.ok(!("publication" in nov.events[0]) && !("createdBy" in nov.events[0]), "공개 응답에 관리 정보가 없다");
  assert.deepEqual((await req("/api/board/motorsport/events?from=2026-11-01&to=2026-11-30&scope=INTERNATIONAL")).events.map((e) => e.id), [vegasRace.id]);
  assert.deepEqual((await req("/api/board/motorsport/events?from=2026-11-01&to=2026-11-30&series=super-race")).events.map((e) => e.id), [race.id]);

  // 다른 운영자(MANAGER2)가 MANAGER의 일정을 수정한다. 확인일이 바뀌면 확인한 운영자도 바뀐다.
  const edited = await req(`${M}/events/${race.id}`, { method: "PUT", token: tokens.n, data: {
    seriesId: series.id, venueId: inje.id, kind: "RACE", title: "슈퍼레이스 최종전 (시간 변경)", startsOn: "2026-10-31", endsOn: "2026-11-01",
    startsAt: "2026-11-01T13:00:00+09:00", status: "CHANGED", sourceUrl: "https://example.com/sr/2026", sourceName: "주최 측 공지", verifiedOn: today } });
  assert.equal(edited.updatedBy, MANAGER2);
  assert.equal(edited.verifiedBy, MANAGER2);
  assert.equal(edited.publication, "PUBLISHED");
  await req(`${M}/events/${race.id}/verify`, { method: "POST", token: tokens.m });

  // 비공개 → 공개 API에서 사라진다(상세도 404).
  await req(`${M}/events/${race.id}/hide`, { method: "POST", token: tokens.m, data: { reason: "일정 재확인 중" } });
  await req(`/api/board/motorsport/events/${race.id}`, { expected: 404 });
  assert.deepEqual((await req("/api/board/motorsport/events?from=2026-10-01&to=2026-10-31")).events, []);
  await req(`${M}/events/${race.id}/publish`, { method: "POST", token: tokens.n });

  // 후기 연결(4단계에서 API로 만든다): 연결된 글 수, 삭제된 글은 세지 않는다.
  await db.query("UPDATE board_posts SET motorsport_event_id=$1 WHERE id=$2", [race.id, oldPost]);
  assert.equal((await req(`/api/board/motorsport/events/${race.id}`)).linkedPostCount, 1);

  // 삭제·복원은 ADMIN만. 강등된 ADMIN 세션(DB MANAGER)도 거부된다.
  await req(`${M}/events/${race.id}`, { method: "DELETE", token: tokens.m, expected: 403 });
  await req(`${M}/events/${race.id}`, { method: "DELETE", token: tokens.a, expected: 204, data: { reason: "중복 등록" } });
  await req(`${M}/events/${race.id}`, { method: "DELETE", token: tokens.a, expected: 409 });
  await req(`/api/board/motorsport/events/${race.id}`, { expected: 404 });
  assert.deepEqual((await req("/api/board/motorsport/events?from=2026-10-01&to=2026-10-31")).events, []);
  await req(`${M}/events/${race.id}`, { method: "PUT", token: tokens.m, expected: 409, data: {} });
  await req(`${M}/events/${race.id}/publish`, { method: "POST", token: tokens.m, expected: 409 });
  // 삭제돼도 후기 글 연결은 남는다(소프트 삭제).
  assert.equal((await db.query("SELECT motorsport_event_id FROM board_posts WHERE id=$1", [oldPost])).rows[0].motorsport_event_id, race.id);
  assert.equal((await req(`${M}/events?deleted=only`, { token: tokens.m })).total, 1);
  await req(`${M}/events/${race.id}/restore`, { method: "POST", token: tokens.m, expected: 403 });
  await req(`${M}/events/${race.id}/restore`, { method: "POST", token: tokens.a });
  assert.equal((await req(`/api/board/motorsport/events/${race.id}`)).id, race.id);

  // 장소 시간대를 바꾸면 기존 일정의 시작 시각이 기간 밖이 되는 경우 거부한다.
  await req(`${M}/venues/${vegas.id}`, { method: "PUT", token: tokens.m, expected: 409,
    data: { name: "Las Vegas Strip Circuit", country: "US", timezone: "Asia/Seoul" } });

  // 재확인 대기열: 확인일이 오래된 다가오는 일정. (오늘 기준이라 미래 일정을 하나 만든다.)
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 10 * 86_400_000).toISOString().slice(0, 10);
  const staleOne = await req(`${M}/events`, { method: "POST", token: tokens.m, expected: 201, data: {
    venueId: inje.id, kind: "TRACK_DAY", title: "스포츠주행", startsOn: soon, sourceUrl: "https://example.com/inje/td",
    sourceName: "서킷 공지", verifiedOn: "2026-01-01" } });
  assert.ok((await req(`${M}/stale`, { token: tokens.m })).events.some((e) => e.id === staleOne.id));

  // 회원 탈퇴 등으로 이벤트 행이 실제로 지워지면(관리 API에는 없음) 글의 연결만 끊긴다.
  await db.query("DELETE FROM content_admin_logs WHERE entity_type='MOTORSPORT_EVENT' AND entity_id=$1", [staleOne.id]);
  await db.query("UPDATE board_posts SET motorsport_event_id=$1 WHERE id=$2", [staleOne.id, oldPost]);
  await db.query("DELETE FROM motorsport_events WHERE id=$1", [staleOne.id]);
  assert.equal((await db.query("SELECT motorsport_event_id FROM board_posts WHERE id=$1", [oldPost])).rows[0].motorsport_event_id, null);

  // --- 4. 감사 로그 ---
  const logs = (await db.query(
    `SELECT entity_type,entity_id,action,actor_id,actor_role,reason,created_at,before IS NOT NULL AS has_before,after IS NOT NULL AS has_after
     FROM content_admin_logs WHERE entity_type='MOTORSPORT_EVENT' AND entity_id=$1 ORDER BY id`, [race.id])).rows;
  assert.deepEqual(logs.map((l) => [l.action, Number(l.actor_id), l.actor_role]), [
    ["CREATE", MANAGER, "MANAGER"], ["PUBLISH", MANAGER, "MANAGER"], ["UPDATE", MANAGER2, "MANAGER"], ["VERIFY", MANAGER, "MANAGER"],
    ["HIDE", MANAGER, "MANAGER"], ["PUBLISH", MANAGER2, "MANAGER"], ["DELETE", ADMIN, "ADMIN"], ["RESTORE", ADMIN, "ADMIN"],
  ]);
  assert.ok(logs.every((l) => l.created_at instanceof Date && l.has_after));
  assert.ok(logs.slice(1).every((l) => l.has_before));
  assert.equal(logs.find((l) => l.action === "HIDE").reason, "일정 재확인 중");
  assert.equal(logs.find((l) => l.action === "DELETE").reason, "중복 등록");
  const updateLog = (await db.query(
    "SELECT before->>'title' AS b, after->>'title' AS a FROM content_admin_logs WHERE entity_id=$1 AND action='UPDATE'", [race.id])).rows[0];
  assert.deepEqual(updateLog, { b: "슈퍼레이스 최종전", a: "슈퍼레이스 최종전 (시간 변경)" });
  // 시리즈·장소 변경도 남는다. 거부된 요청(403/400/409)은 아무것도 남기지 않았다.
  const kinds = (await db.query("SELECT entity_type,action,count(*)::int AS n FROM content_admin_logs GROUP BY 1,2 ORDER BY 1,2")).rows;
  assert.deepEqual(kinds.filter((k) => k.entity_type !== "MOTORSPORT_EVENT"),
    [{ entity_type: "MOTORSPORT_SERIES", action: "CREATE", n: 2 }, { entity_type: "MOTORSPORT_VENUE", action: "CREATE", n: 2 }]);
  const apiLogs = await req(`${M}/logs?entityType=MOTORSPORT_EVENT&entityId=${race.id}`, { token: tokens.m });
  assert.equal(apiLogs.total, 8);
  assert.equal(apiLogs.items[0].action, "RESTORE");
  assert.equal(apiLogs.items[0].actorUsername, "admin");
  console.log("PASS motorsport-system: V6 on V1~V5 data, roles (USER/MANAGER/ADMIN, demoted session), publish/hide/delete/restore, public filters, time zones, audit logs");
} finally {
  server?.close();
  await db?.end();
  await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await root.end();
}
