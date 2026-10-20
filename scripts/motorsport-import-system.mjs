// Run: scripts/run-board-system.sh scripts/motorsport-import-system.mjs (임시 PostgreSQL, Neon 미사용)
// 공식 일정 자동 수집(V9 + board-service src/motorsport-import)을 실제 PostgreSQL로 확인한다. 출처는 F1 페이지와 같은
// 구조의 픽스처(RSC race 객체 + JSON-LD)로 흉내 내고, 단계마다 출처 값을 바꾼다.
//  1. 계정: 수집 계정이 MANAGER가 아니면 반영하지 않고 실패 기록을 남긴다.
//  2. dry-run은 아무것도 쓰지 않는다. 반영은 DRAFT로 넣고, 끝난 경기는 넣지 않는다. 재실행·동시 실행에도 행이 늘지 않는다.
//  3. 출처 변경: 초안은 그대로 갱신, 공개 일정은 갱신 + CHANGED, 운영자가 고친 값은 덮어쓰지 않고 재확인 대기열로.
//     운영자가 확인하면 대기열에서 빠진다. 명시적 취소만 CANCELLED.
//  4. 출처에서 사라진 일정·수집 실패는 삭제·취소하지 않는다. 삭제된 일정은 다시 만들지 않는다.
//  5. 관리자 대기열 API가 출처별 마지막 실행 결과를 돌려준다.
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "./src/app.js";
import { runSource } from "./src/motorsport-import/run.js";
import { applyFlywayMigrations, assertIsolatedDatabase } from "./scripts/lib/flyway-migrations.mjs";
assertIsolatedDatabase();
const root = new pg.Pool();
const schema = `motorsport_import_test_${Date.now()}`;
let db, server;
const BOT = 301, MEMBER = 302, MANAGER = 303;
const TODAY = "2026-10-20";
const token = "m".repeat(43);

// --- F1 픽스처 ---
const BASE = "https://www.formula1.com";
const meeting = (o) => ({
  type: "race", meetingCountryCode: "USA", meetingTimezone: "America/Chicago", circuitKey: "9",
  circuitOfficialName: "Circuit of The Americas", circuitLocation: "Austin", meetingSessions: [], ...o,
});
const race = (start, offset, status) => ({ session: "r", startTime: start, gmtOffset: offset, ...(status && { sessionStatus: status }) });
const page = (m, eventStatus = "https://schema.org/EventScheduled") =>
  `<script type="application/ld+json">${JSON.stringify({ "@type": "SportsEvent", eventStatus, subEvent: [] })}</script>` +
  `<script>self.__next_f.push([1,${JSON.stringify(`x:{"race":${JSON.stringify(m)}}`)}])</script>`;
const season = (year, slugs) => slugs.map((s) => `<a href="/en/racing/${year}/${s}">${s}</a>`).join("");
let pages;
function reset() {
  pages = {
    [`${BASE}/en/racing/2026`]: season(2026, ["japan", "united-states"]),
    [`${BASE}/en/racing/2027`]: season(2027, ["bahrain"]),
    // 이미 끝난 경기: 반영하지 않는다.
    [`${BASE}/en/racing/2026/japan`]: page(meeting({ meetingKey: "1280", meetingName: "Japanese Grand Prix", meetingCountryCode: "JPN",
      meetingTimezone: "Asia/Tokyo", circuitKey: "46", circuitOfficialName: "Suzuka Circuit", meetingStartDate: "2026-03-27T00:00:00.000Z",
      meetingEndDate: "2026-03-29T23:59:59.999Z" })),
    [`${BASE}/en/racing/2026/united-states`]: page(meeting({ meetingKey: "1297", meetingName: "United States Grand Prix",
      meetingStartDate: "2026-10-23T00:00:00.000Z", meetingEndDate: "2026-10-25T23:59:59.999Z",
      meetingSessions: [race("2026-10-25T15:00:00", "-05:00")] })),
    // 시각 TBC: 시각을 저장하지 않는다.
    [`${BASE}/en/racing/2027/bahrain`]: page(meeting({ meetingKey: "1310", meetingName: "Bahrain Grand Prix", meetingCountryCode: "BRN",
      meetingTimezone: "Asia/Bahrain", circuitKey: "63", circuitOfficialName: "Bahrain International Circuit",
      meetingStartDate: "2027-03-12T00:00:00.000Z", meetingEndDate: "2027-03-14T23:59:59.999Z",
      meetingSessions: [race("2027-03-14T15:00:00", "+03:00", "TBC")] })),
  };
}
const fetchText = async (url) => {
  if (!(url in pages)) throw new Error(`${url} → HTTP 404`);
  if (pages[url] === 500) throw new Error(`${url} → HTTP 500`);
  return pages[url];
};
const run = (apply = true, actorId = BOT) => runSource({ db, source: "f1", fetchText, today: TODAY, actorId, apply });
const event = async (key) => (await db.query(
  `SELECT id,title,to_char(starts_on,'YYYY-MM-DD') AS "startsOn",to_char(ends_on,'YYYY-MM-DD') AS "endsOn",starts_at AS "startsAt",
     status,publication,source_snapshot AS snap,source_latest AS latest,source_checked_at AS checked,verified_by AS "verifiedBy",deleted_at
   FROM motorsport_events WHERE source_key=$1`, [key])).rows[0];
const count = async (sql = "SELECT count(*)::int AS n FROM motorsport_events") => (await db.query(sql)).rows[0].n;

try {
  await root.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ options: `-c search_path=${schema}` });
  await applyFlywayMigrations(db);
  await db.query(`INSERT INTO users(id,username,password,role) VALUES($1,'schedule-bot','!','MANAGER'),($2,'member','x','USER'),
    ($3,'manager','x','MANAGER')`, [BOT, MEMBER, MANAGER]);
  reset();

  // --- 1. 계정 검사 ---
  await assert.rejects(run(true, MEMBER), /MANAGER/);
  const failedRun = (await db.query("SELECT ok,error FROM motorsport_import_runs ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(failedRun.ok, false);
  assert.match(failedRun.error, /MANAGER/);
  assert.equal(await count(), 0);

  // --- 2. dry-run → 반영 → 재실행 → 동시 실행 ---
  const dry = await run(false);
  assert.equal(dry.inserted, 2);
  assert.equal(await count(), 0);
  assert.equal(await count("SELECT count(*)::int AS n FROM motorsport_venues"), 0);
  assert.equal(await count("SELECT count(*)::int AS n FROM motorsport_import_runs"), 1); // dry-run은 기록하지 않는다

  const first = await run();
  assert.deepEqual([first.ok, first.inserted, first.collected], [true, 2, 2]);
  const us = await event("f1:1297");
  assert.deepEqual([us.publication, us.status, us.startsOn, us.endsOn], ["DRAFT", "SCHEDULED", "2026-10-23", "2026-10-25"]);
  assert.equal(us.startsAt.toISOString(), "2026-10-25T20:00:00.000Z");
  assert.ok(us.checked);
  assert.equal((await event("f1:1310")).startsAt, null); // TBC
  assert.equal(await event("f1:1280"), undefined); // 끝난 경기
  assert.equal(await count("SELECT count(*)::int AS n FROM motorsport_series WHERE code='f1'"), 1);
  assert.equal(await count("SELECT count(*)::int AS n FROM motorsport_venues"), 2);
  assert.equal(await count("SELECT count(*)::int AS n FROM content_admin_logs WHERE actor_id=301 AND action='CREATE'"), 5);

  const again = await run();
  assert.deepEqual([again.inserted, again.unchanged, again.updated], [0, 2, 0]);
  const parallel = await Promise.all([run(), run(), run()]);
  assert.ok(parallel.every((r) => r.ok));
  assert.equal(await count(), 2);
  // 다른 연결이 잠금을 쥐고 있으면 건너뛴다.
  const holder = await db.connect();
  await holder.query("SELECT pg_advisory_lock(hashtext('motorsport-import:f1'))");
  assert.equal((await run()).skipped, true);
  await holder.query("SELECT pg_advisory_unlock(hashtext('motorsport-import:f1'))");
  holder.release();

  // --- 3. 출처 변경 ---
  // 초안: 날짜가 바뀌면 그대로 갱신(상태는 SCHEDULED 유지).
  pages[`${BASE}/en/racing/2027/bahrain`] = pages[`${BASE}/en/racing/2027/bahrain`]
    .replaceAll("2027-03-12", "2027-03-19").replaceAll("2027-03-14", "2027-03-21");
  const moved = await run();
  assert.equal(moved.updated, 1);
  const bahrain = await event("f1:1310");
  assert.deepEqual([bahrain.startsOn, bahrain.endsOn, bahrain.status, bahrain.snap.startsOn], ["2027-03-19", "2027-03-21", "SCHEDULED", "2027-03-19"]);

  // 공개 일정: 결승 시각이 바뀌면 갱신하고 CHANGED. 공개 상태는 그대로.
  await db.query("UPDATE motorsport_events SET publication='PUBLISHED',published_at=NOW() WHERE source_key='f1:1297'");
  pages[`${BASE}/en/racing/2026/united-states`] = pages[`${BASE}/en/racing/2026/united-states`].replace("2026-10-25T15:00:00", "2026-10-25T14:00:00");
  assert.equal((await run()).updated, 1);
  let usNow = await event("f1:1297");
  assert.deepEqual([usNow.status, usNow.publication, usNow.startsAt.toISOString()], ["CHANGED", "PUBLISHED", "2026-10-25T19:00:00.000Z"]);
  assert.equal((await run()).updated, 0); // 수집기가 붙인 CHANGED는 다음 실행에서 운영자 수정으로 보지 않는다

  // 운영자가 고친 제목은 덮어쓰지 않는다 → 대기열.
  await db.query("UPDATE motorsport_events SET title='미국 그랑프리' WHERE source_key='f1:1297'");
  pages[`${BASE}/en/racing/2026/united-states`] = pages[`${BASE}/en/racing/2026/united-states`].replace("United States Grand Prix", "MSC United States Grand Prix");
  const conflict = await run();
  assert.equal(conflict.conflict, 1);
  assert.deepEqual(conflict.details.find((d) => d.key === "f1:1297").conflicts, ["title"]);
  usNow = await event("f1:1297");
  assert.equal(usNow.title, "미국 그랑프리");
  assert.equal(usNow.latest.title, "MSC United States Grand Prix");

  server = createApp({ db, redis: { get: async () => JSON.stringify({ id: MANAGER, username: "manager", role: "MANAGER", version: 0 }) } })
    .listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const api = async (path, method = "GET") => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api/board/admin/motorsport${path}`, {
      method, headers: { cookie: `REVCC_SESSION=${token}`, "content-type": "application/json" }, body: method === "POST" ? "{}" : undefined,
    });
    assert.equal(r.status, 200, `${method} ${path} → ${r.status}`);
    return r.json();
  };
  let stale = await api("/stale");
  const queued = stale.events.find((e) => e.sourceKey === "f1:1297");
  assert.equal(queued.sourceReview, true);
  assert.equal(stale.importRuns[0].source, "f1");
  assert.equal(stale.importRuns[0].ok, true);
  assert.ok(stale.importRuns[0].lastSuccessAt);
  await api(`/events/${queued.id}/verify`, "POST");
  stale = await api("/stale");
  assert.equal(stale.events.find((e) => e.sourceKey === "f1:1297"), undefined);
  const settled = await run();
  assert.deepEqual([settled.conflict, settled.updated], [0, 0]);
  assert.equal((await event("f1:1297")).title, "미국 그랑프리");

  // 명시적 취소만 CANCELLED.
  pages[`${BASE}/en/racing/2027/bahrain`] = pages[`${BASE}/en/racing/2027/bahrain`].replace("EventScheduled", "EventCancelled");
  assert.equal((await run()).updated, 1);
  assert.equal((await event("f1:1310")).status, "CANCELLED");

  // --- 4. 사라진 일정·수집 실패·삭제된 일정 ---
  pages[`${BASE}/en/racing/2027`] = season(2027, []);
  const gone = await run();
  assert.equal(gone.ok, true);
  assert.deepEqual(gone.missing.map((m) => m.key), ["f1:1310"]);
  assert.equal((await event("f1:1310")).deleted_at, null);
  assert.equal((await event("f1:1310")).status, "CANCELLED"); // 사라졌다고 상태를 바꾸지 않는다

  pages[`${BASE}/en/racing/2026`] = 500;
  const broken = await run();
  assert.equal(broken.ok, false);
  assert.deepEqual(broken.missing, []);
  assert.equal(await count("SELECT count(*)::int AS n FROM motorsport_events WHERE deleted_at IS NULL"), 2);
  const lastRun = (await db.query("SELECT ok,error FROM motorsport_import_runs ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(lastRun.ok, false);
  assert.match(lastRun.error, /HTTP 500/);
  stale = await api("/stale");
  assert.equal(stale.importRuns[0].ok, false);
  assert.ok(stale.importRuns[0].lastSuccessAt); // 마지막 성공 시각은 남아 있다

  reset();
  await db.query("UPDATE motorsport_events SET deleted_at=NOW(),deleted_by=$1 WHERE source_key='f1:1310'", [MANAGER]);
  const afterDelete = await run();
  assert.equal(afterDelete.deleted, 1);
  assert.equal(await count("SELECT count(*)::int AS n FROM motorsport_events WHERE source_key='f1:1310'"), 1);
  console.log("PASS motorsport-import-system: actor check, dry-run, DRAFT insert, idempotent/concurrent runs, draft/published updates, operator-edit conflicts + verify, explicit cancel, missing/failed sources, deleted events");
} finally {
  server?.close();
  await db?.end();
  await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await root.end();
}
