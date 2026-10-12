import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

// motorsport.test.js와 같은 역할 시나리오: 세션 역할과 "현재 DB 역할"이 다를 수 있다.
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

const touchesSpots = (db) => db.log.some(({ sql }) => /drive_spots|content_admin_logs/.test(sql));
const writes = (db) => db.log.filter(({ sql }) => /^(INSERT|UPDATE|DELETE)/.test(sql.trim()));

const contentReads = ["/api/board/admin/spots", "/api/board/admin/spots/logs"];
const contentWrites = [
  ["/api/board/admin/spots", "POST"],
  ["/api/board/admin/spots/1", "PUT"],
  ["/api/board/admin/spots/1/publish", "POST"],
  ["/api/board/admin/spots/1/hide", "POST"],
];
const adminOnlyWrites = [
  ["/api/board/admin/spots/1", "DELETE"],
  ["/api/board/admin/spots/1/restore", "POST"],
];

test("spots content API: anonymous 401, USER 403, demoted sessions 403 by DB role, MANAGER/ADMIN allowed", async (t) => {
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
  assert.equal(touchesSpots(db), false);
  for (const who of ["m", "a", "y"])
    for (const path of contentReads) assert.equal((await request(who, path)).status, 200, `${who} ${path}`);
});

test("MANAGER cannot delete/restore spots", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  for (const who of ["m", "y"]) {
    for (const [path, method] of adminOnlyWrites)
      assert.equal((await request(who, path, method, {})).status, 403, `${who} ${method} ${path}`);
  }
  assert.equal(writes(db).length, 0);
});

test("spot writes are validated before any SQL runs: category-specific required fields, coordinates, URLs", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  const windingValid = {
    category: "WINDING", name: "미시령 옛길", address: "강원도 고성군", latitude: 38.2, longitude: 128.4,
    routeStart: "미시령휴게소", routeEnd: "고성 방면 입구", distanceKm: 12.5, durationMinutes: 25,
  };
  const simRacingValid = {
    category: "SIM_RACING", name: "서울 심레이싱 센터", address: "서울시 강남구", latitude: 37.5, longitude: 127.0,
    businessHours: "매일 10:00-22:00",
  };
  const cases = [
    { ...windingValid, category: "BIKE" },
    { ...windingValid, latitude: 91 },
    { ...windingValid, longitude: -181 },
    { ...windingValid, latitude: undefined }, // required
    { ...windingValid, name: "   " }, // empty after trim
    { ...windingValid, routeStart: undefined }, // required for WINDING
    { ...windingValid, route: [{ lat: 38.2, lng: 128.4 }] }, // route needs >= 2 points
    { ...windingValid, route: [{ lat: 38.2, lng: 128.4 }, { lat: 999, lng: 128.4 }] },
    { ...simRacingValid, businessHours: undefined }, // required for SIM_RACING
    { ...simRacingValid, officialUrl: "javascript:alert(1)" },
    { ...simRacingValid, reservationUrl: "ftp://example.com" },
    { ...simRacingValid, imageUrl: "not-a-url" },
  ];
  for (const body of cases) {
    const response = await request("a", "/api/board/admin/spots", "POST", body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(touchesSpots(db), false);
});

test("public spots list validates category, bbox and limit before SQL", async (t) => {
  const db = fakeDb();
  const request = await start(t, db);
  for (const query of ["category=BIKE", "bbox=1,2,3", "bbox=10,10,5,5", "bbox=a,b,c,d", "limit=201"]) {
    assert.equal((await request(null, `/api/board/spots?${query}`)).status, 400, query);
  }
  assert.equal(touchesSpots(db), false);
  assert.equal((await request(null, "/api/board/spots?category=WINDING&region=강원")).status, 200);
  assert.equal((await request(null, "/api/board/spots?bbox=37.0,126.5,38.0,127.5")).status, 200);
});
