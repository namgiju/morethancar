import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

// 외부 감시용 health: DB·Redis 상태를 200/503으로 구분하고, 내부 정보를 싣지 않으며, 짧게 끝나는지 확인한다.
const ok = { db: { query: async () => ({ rows: [{ "?column?": 1 }] }) }, redis: { ping: async () => "PONG" } };
const never = () => new Promise(() => {});

async function start(t, deps) {
  const server = createApp({ healthTimeoutMs: 300, ...deps }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

async function check(base, path) {
  const started = Date.now();
  const res = await fetch(base + path, { signal: AbortSignal.timeout(5_000) });
  return { status: res.status, body: await res.text(), elapsed: Date.now() - started, cache: res.headers.get("cache-control") };
}

test("DB와 Redis가 정상이면 /health와 /api/board/health 모두 200", async (t) => {
  const base = await start(t, ok);
  for (const path of ["/health", "/api/board/health"]) {
    const r = await check(base, path);
    assert.equal(r.status, 200, path);
    assert.deepEqual(JSON.parse(r.body), { status: "ok" });
    assert.equal(r.cache, "no-store");
  }
});

test("DB·Redis 오류나 응답 없음은 timeout 안에 503, 원인은 응답에 싣지 않는다", async (t) => {
  const cases = {
    "DB 오류": { ...ok, db: { query: async () => { throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password authentication failed"); } } },
    "Redis 오류": { ...ok, redis: { ping: async () => { throw new Error("NOAUTH Authentication required. redis://redis:6379"); } } },
    "DB 응답 없음": { ...ok, db: { query: never } },
    "Redis 응답 없음": { ...ok, redis: { ping: never } },
  };
  for (const [name, deps] of Object.entries(cases)) {
    const base = await start(t, deps);
    const r = await check(base, "/api/board/health");
    assert.equal(r.status, 503, name);
    assert.deepEqual(JSON.parse(r.body), { status: "unavailable" }, name);
    assert.ok(r.elapsed < 2_000, `${name}: ${r.elapsed}ms`);
  }
});
