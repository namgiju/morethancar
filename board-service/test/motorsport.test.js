import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { instant, isoDate, kstToday, localDate, range, timezone, webUrl } from "../src/motorsport.js";

// Session role (Redis) vs current DB role. Authorization must follow the DB role:
//  x: session MANAGER, DB demoted to USER   → no content access
//  y: session ADMIN,   DB demoted to MANAGER → content yes, ADMIN-only (delete/restore, /api/board/admin/*) no
//  d: session ADMIN,   DB demoted to USER    → nothing
const sessions = {
  u: { id: 7, username: "member", role: "USER" },
  m: { id: 5, username: "manager", role: "MANAGER" },
  a: { id: 1, username: "admin", role: "ADMIN" },
  x: { id: 6, username: "ex-manager", role: "MANAGER" },
  y: { id: 3, username: "admin-to-manager", role: "ADMIN" },
  d: { id: 2, username: "demoted", role: "ADMIN" },
};
const dbRoles = { 7: "USER", 5: "MANAGER", 1: "ADMIN", 6: "USER", 3: "MANAGER", 2: "USER" };

function fakeDb() {
  const log = [];
  const run = (sql, values = []) => {
    log.push({ sql, values });
    if (sql.startsWith("SELECT COALESCE(auth_version"))
      return { rows: [{ version: 0, status: "ACTIVE", suspended_until: null }] };
    if (sql.startsWith("SELECT id,username,role")) {
      const id = values[0];
      return { rows: dbRoles[id] ? [{ id, username: "db-user", role: dbRoles[id], status: "ACTIVE", suspended_until: null }] : [] };
    }
    if (sql.includes("SELECT (SELECT count(*)::int FROM filtered)")) return { rows: [{ total: 0, items: [] }] };
    if (/totalPosts/.test(sql)) return { rows: [{ totalPosts: 0, pendingReports: 0 }] };
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

const touchesMotorsport = (db) => db.log.some(({ sql }) => /motorsport_|content_admin_logs/.test(sql));
const writes = (db) => db.log.filter(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql.trim()));

const contentReads = ["/api/board/admin/motorsport/events", "/api/board/admin/motorsport/stale", "/api/board/admin/motorsport/logs",
  "/api/board/admin/motorsport/series", "/api/board/admin/motorsport/venues"];
const contentWrites = [
  ["/api/board/admin/motorsport/events", "POST"],
  ["/api/board/admin/motorsport/events/1", "PUT"],
  ["/api/board/admin/motorsport/events/1/publish", "POST"],
  ["/api/board/admin/motorsport/events/1/hide", "POST"],
  ["/api/board/admin/motorsport/events/1/verify", "POST"],
  ["/api/board/admin/motorsport/series", "POST"],
  ["/api/board/admin/motorsport/series/1", "PUT"],
  ["/api/board/admin/motorsport/venues", "POST"],
  ["/api/board/admin/motorsport/venues/1", "PUT"],
];
const adminOnlyWrites = [
  ["/api/board/admin/motorsport/events/1", "DELETE"],
  ["/api/board/admin/motorsport/events/1/restore", "POST"],
];
// The existing community moderation API stays ADMIN-only.
const existingAdmin = ["/api/board/admin/overview", "/api/board/admin/members", "/api/board/admin/posts",
  "/api/board/admin/reports", "/api/board/admin/logs", "/api/board/admin/badges"];

test("motorsport content API: anonymous 401, USER 403, demoted sessions 403 by DB role, MANAGER/ADMIN allowed", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  for (const path of contentReads) {
    assert.equal((await request(null, path)).status, 401, path);
    for (const who of ["u", "x", "d"]) assert.equal((await request(who, path)).status, 403, `${who} ${path}`);
  }
  for (const [path, method] of [...contentWrites, ...adminOnlyWrites]) {
    assert.equal((await request(null, path, method, {})).status, 401, `${method} ${path}`);
    for (const who of ["u", "x", "d"]) assert.equal((await request(who, path, method, {})).status, 403, `${who} ${method} ${path}`);
  }
  // Nothing was read from or written to the motorsport tables for a refused request.
  assert.equal(touchesMotorsport(db), false);
  // MANAGER, ADMIN and an ADMIN session whose DB role is now MANAGER can read the content API.
  for (const who of ["m", "a", "y"])
    for (const path of contentReads) assert.equal((await request(who, path)).status, 200, `${who} ${path}`);
});

test("MANAGER cannot delete/restore events and cannot reach the existing /api/board/admin API", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  for (const who of ["m", "y"]) {
    for (const [path, method] of adminOnlyWrites)
      assert.equal((await request(who, path, method, {})).status, 403, `${who} ${method} ${path}`);
    for (const path of existingAdmin) assert.equal((await request(who, path)).status, 403, `${who} ${path}`);
    assert.equal((await request(who, "/api/board/admin/reports/1", "PATCH", { status: "resolved", note: "x" })).status, 403);
  }
  assert.equal(writes(db).length, 0);
  // ADMIN keeps the existing admin API.
  // (Only the paths the fake DB can answer; admin-market.test.js covers the same set.)
  for (const path of ["/api/board/admin/overview", "/api/board/admin/logs", "/api/board/admin/members"])
    assert.equal((await request("a", path)).status, 200, `a ${path}`);
});

test("event writes are validated before any SQL runs", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  const valid = {
    venueId: 1, kind: "RACE", title: "슈퍼레이스 7전", startsOn: "2026-10-24", endsOn: "2026-10-25",
    sourceUrl: "https://example.com/schedule", sourceName: "주최 측 공지", verifiedOn: "2026-10-01",
  };
  const cases = [
    { ...valid, kind: "PARTY" },
    { ...valid, startsOn: "2026-02-30" },
    { ...valid, endsOn: "2026-10-23" }, // before start
    { ...valid, endsOn: "2026-12-31" }, // longer than 32 days
    { ...valid, startsAt: "2026-10-24T14:00:00" }, // no offset → ambiguous
    { ...valid, sourceUrl: "javascript:alert(1)" },
    { ...valid, sourceUrl: "https://user:pw@example.com/" },
    { ...valid, sourceUrl: undefined },
    { ...valid, sourceName: "   " },
    { ...valid, verifiedOn: "2999-01-01" }, // future
    { ...valid, status: "DONE" },
    { ...valid, title: "<b></b>" }, // empty after tag stripping
  ];
  for (const body of cases) {
    const response = await request("a", "/api/board/admin/motorsport/events", "POST", body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(touchesMotorsport(db), false);
});

test("public range filter is validated before SQL and capped at 93 days", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  for (const query of ["from=2026-13-01", "from=2026-10-10&to=2026-10-01", "from=2026-01-01&to=2026-06-30", "kind=PARTY", "scope=MARS", "limit=201"]) {
    assert.equal((await request(null, `/api/board/motorsport/events?${query}`)).status, 400, query);
  }
  assert.equal(touchesMotorsport(db), false);
  assert.equal((await request(null, "/api/board/motorsport/events?from=2026-10-01&to=2027-01-01")).status, 200);
});

test("date helpers: strict dates, KST today, default month range", () => {
  assert.equal(isoDate("2028-02-29"), "2028-02-29");
  assert.throws(() => isoDate("2027-02-29"), /확인/);
  assert.throws(() => isoDate("2026-1-1"), /YYYY-MM-DD/);
  // 2026-10-31 15:30 UTC is already 2026-11-01 in Seoul.
  assert.equal(kstToday(Date.parse("2026-10-31T15:30:00Z")), "2026-11-01");
  assert.equal(kstToday(Date.parse("2026-10-31T14:59:59Z")), "2026-10-31");
  assert.deepEqual(range({}, "2026-02-14"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(range({}, "2028-02-03"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(range({ from: "2026-12-05" }, "2026-01-01"), { from: "2026-12-05", to: "2026-12-31" });
});

test("time zone helpers: IANA names only, instants need an offset, local date at the venue", () => {
  assert.equal(timezone("Asia/Seoul"), "Asia/Seoul");
  assert.equal(timezone("America/Argentina/Buenos_Aires"), "America/Argentina/Buenos_Aires");
  assert.throws(() => timezone("KST"));
  assert.throws(() => timezone("Mars/Olympus_Mons"), /알 수 없는/);
  assert.equal(instant(undefined), null);
  assert.throws(() => instant("2026-10-25 14:00"));
  assert.throws(() => instant("2026-10-25T14:00:00"));
  const race = instant("2026-11-22T04:00:00Z"); // e.g. a Las Vegas night race: Saturday 20:00 local
  assert.equal(localDate(race, "America/Los_Angeles"), "2026-11-21");
  assert.equal(localDate(race, "Asia/Seoul"), "2026-11-22");
  assert.equal(webUrl("https://www.example.com/a?b=1", "URL"), "https://www.example.com/a?b=1");
  assert.equal(webUrl("", "URL", false), null);
  assert.throws(() => webUrl("ftp://example.com", "URL"));
  assert.throws(() => webUrl("https://exa mple.com", "URL"));
});
