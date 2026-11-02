// Run: scripts/run-board-system.sh scripts/community-system.mjs (임시 PostgreSQL, Neon 미사용)
// Uses an isolated PostgreSQL schema; always cleans it up. No live posts are created.
import assert from "node:assert/strict";
import pg from "pg";
import { createApp } from "./src/app.js";
import { applyFlywayMigrations, assertIsolatedDatabase } from "./scripts/lib/flyway-migrations.mjs";
assertIsolatedDatabase();
const admin = new pg.Pool();
const schema = `community_test_${Date.now()}`;
let db, server;
const tokenA = "a".repeat(43),
  tokenB = "b".repeat(43);
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4FoAAAAASUVORK5CYII=";
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new pg.Pool({ options: `-c search_path=${schema}` });
  await applyFlywayMigrations(db);
  await db.query(
    "INSERT INTO users(id,username,password) VALUES(1,'owner','test-only'),(2,'reader','test-only')",
  );
  const redis = {
    get: async (key) =>
      key.endsWith(tokenA)
        ? JSON.stringify({ id: 1, username: "owner" })
        : key.endsWith(tokenB)
          ? JSON.stringify({ id: 2, username: "reader" })
          : null,
  };
  server = createApp({ db, redis }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/board`;
  async function req(
    path,
    method = "GET",
    data,
    token = tokenA,
    expected = 200,
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: token ? `REVCC_SESSION=${token}` : "",
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const body = await r.json();
    assert.equal(
      r.status,
      expected,
      `${method} ${path}: ${JSON.stringify(body)}`,
    );
    return body;
  }
  await req("/posts", "POST", { title: "bad", content: "no auth" }, "", 401);
  const image = await req("/images", "POST", { data: png }, tokenA, 201);
  // 아직 어디에도 첨부하지 않은 사진은 소유자(작성 중 미리보기)만 볼 수 있다(STEP 10-impl-B).
  assert.equal((await fetch(base + `/images/${image.id}`)).status, 404);
  const raw = await fetch(base + `/images/${image.id}`, { headers: { Cookie: `REVCC_SESSION=${tokenA}` } });
  assert.equal(raw.headers.get("content-type"), "image/png");
  assert.equal(
    (await raw.arrayBuffer()).byteLength,
    Buffer.from(png.split(",")[1], "base64").length,
  );
  await req(
    "/images",
    "POST",
    { data: "data:image/svg+xml;base64,PHN2Zz4=" },
    tokenA,
    400,
  );
  const car = await req(
    "/garage",
    "POST",
    {
      model: "아반떼 N",
      year: 2024,
      trim: "DCT",
      bio: "테스트 차고",
      imageId: image.id,
    },
    tokenA,
    201,
  );
  const linkedDraft={title:"linked",content:"real owner vehicle",category:"drive",vehicleId:car.id};
  const linked=await req("/posts","POST",linkedDraft,tokenA,201);
  assert.equal(linked.category,"drive");
  const linkedDetail=await req(`/posts/${linked.id}`,"GET",undefined,"");
  assert.equal(linkedDetail.vehicleId,car.id);
  assert.equal(linkedDetail.linkedVehicle.model,"아반떼 N");
  await req("/posts","POST",linkedDraft,tokenB,403);
  await req(`/posts/${linked.id}`,"PUT",{...linkedDraft,vehicleId:2147483647},tokenA,403);
  await req(`/posts/${linked.id}`,"PUT",{title:"legacy",content:"unchanged"});
  assert.equal((await req(`/posts/${linked.id}`)).vehicleId,car.id);
  await req(`/posts/${linked.id}`,"PUT",{...linkedDraft,vehicleId:null});
  assert.equal((await req(`/posts/${linked.id}`)).linkedVehicle,null);
  const transientCar=await req("/garage","POST",{model:"transient",year:2025},tokenA,201);
  await req(`/posts/${linked.id}`,"PUT",{...linkedDraft,vehicleId:transientCar.id});
  await req(`/garage/${transientCar.id}`,"DELETE",{});
  assert.equal((await req(`/posts/${linked.id}`)).vehicleId,null);
  await req(`/posts/${linked.id}`,"DELETE",{});
  const emptyMember = await req("/members/2");
  assert.equal(emptyMember.joinedAt, null);
  assert.equal(emptyMember.avatarUrl, null);
  assert.deepEqual(emptyMember.badges, []);
  assert.deepEqual(emptyMember.vehicles, []);
  assert.equal(emptyMember.representativeVehicle, null);
  assert.equal(emptyMember.verified, false);
  const unverifiedMember = await req("/members/1");
  assert.equal(unverifiedMember.representativeVehicle.id, car.id);
  assert.deepEqual(unverifiedMember.badges, []);
  await db.query("UPDATE owner_vehicles SET verified=true,license_plate='PRIVATE-PLATE',verification_status='APPROVED' WHERE id=$1", [car.id]);
  await db.query("UPDATE users SET created_at='2026-01-01T00:00:00Z' WHERE id=1");
  const verifiedMember = await req("/members/1", "GET", undefined, "");
  assert.equal(verifiedMember.verified, true);
  assert.equal(verifiedMember.badges[0].code, "verified-owner");
  assert.equal(verifiedMember.vehicles[0].imageId, image.id);
  assert.equal(verifiedMember.joinedAt, "2026-01-01T00:00:00.000Z");
  assert.ok(!JSON.stringify(verifiedMember).includes("PRIVATE-PLATE"));
  assert.ok(!JSON.stringify(verifiedMember).includes("verification_status"));
  await req("/members/99999", "GET", undefined, "", 404);
  const draft = {
    title: "타이어 교체 경험",
    content: "안전한 사진과 내용 <script>alert(1)</script>",
    category: "maintenance",
    vehicle: "아반떼 N",
    imageIds: [image.id],
  };
  await req("/posts", "POST", draft, tokenB, 400);
  const post = await req("/posts", "POST", draft, tokenA, 201);
  let detail = await req(`/posts/${post.id}`);
  assert.equal(detail.authorId, 1);
  assert.equal(detail.ownerVehicle, "아반떼 N");
  assert.deepEqual(detail.imageIds, [image.id]);
  assert.equal(
    (await req("/posts?q=타이어&category=maintenance&vehicle=아반떼&limit=20"))
      .length,
    1,
  );
  assert.equal((await req("/posts?category=parts")).length, 0);
  assert.equal((await req("/posts?q=%25")).length, 0);
  await req("/posts?limit=0", "GET", undefined, tokenA, 400);
  await req(
    `/posts/${post.id}`,
    "PUT",
    { ...draft, title: "forged" },
    tokenB,
    400,
  ); // foreign image rejected before owner mutation
  await req(
    `/posts/${post.id}`,
    "PUT",
    { ...draft, title: "forged", imageIds: [] },
    tokenB,
    403,
  );
  await req(`/posts/${post.id}`, "DELETE", {}, tokenB, 403);
  await req(`/posts/${post.id}`, "PUT", {
    ...draft,
    title: "타이어 교체 후기",
  });
  await req(`/posts/${post.id}/like`, "PUT", { active: true }, tokenB);
  await req(`/posts/${post.id}/like`, "PUT", { active: true }, tokenB);
  await req(`/posts/${post.id}/bookmark`, "PUT", { active: true }, tokenB);
  detail = await req(`/posts/${post.id}`, "GET", undefined, tokenB);
  assert.equal(detail.likeCount, 1);
  assert.equal(detail.bookmarked, true);
  assert.equal(
    (await req("/posts?scope=bookmarks", "GET", undefined, tokenB)).length,
    1,
  );
  assert.equal(
    (await req("/posts?scope=mine", "GET", undefined, tokenB)).length,
    0,
  );
  await req("/posts?scope=mine", "GET", undefined, "", 401);
  const comment = await req(
    `/posts/${post.id}/comments`,
    "POST",
    { content: "도움이 됐어요." },
    tokenB,
    201,
  );
  const reply = await req(
    `/posts/${post.id}/comments`,
    "POST",
    { content: "감사합니다.", parentId: comment.id },
    tokenA,
    201,
  );
  await req(
    `/posts/${post.id}/comments`,
    "POST",
    { content: "깊은 답글", parentId: reply.id },
    tokenA,
    404,
  );
  const other = await req(
    "/posts",
    "POST",
    { title: "다른 글", content: "테스트" },
    tokenB,
    201,
  );
  await req(
    `/posts/${other.id}/comments`,
    "POST",
    { content: "잘못된 부모", parentId: comment.id },
    tokenA,
    404,
  );
  const authorProfile = await req("/members/1");
  assert.equal(authorProfile.postCount, 1);
  assert.equal(authorProfile.commentCount, 1);
  assert.equal(authorProfile.receivedLikes, 1);
  assert.equal(authorProfile.posts.length, 1);
  const relatedPosts = await req("/posts?vehicle=아반떼%20N&sort=popular&limit=6");
  assert.deepEqual(relatedPosts.map(p => p.id), [post.id]);
  const categoryPosts = await req("/posts?category=maintenance&sort=latest&limit=6");
  assert.deepEqual(categoryPosts.map(p => p.id), [post.id]);
  assert.equal((await req("/notifications")).length, 1);
  assert.equal(
    (await req("/notifications", "GET", undefined, tokenB)).length,
    1,
  );
  await req("/notifications/read", "PUT", {});
  assert.equal((await req("/notifications"))[0].isRead, true);
  assert.equal((await req(`/posts/${post.id}/comments`)).length, 2);
  assert.equal(
    (await req("/posts?scope=commented", "GET", undefined, tokenB)).length,
    1,
  );
  await req(`/comments/${comment.id}`, "DELETE", {}, tokenA, 403);
  await req(`/comments/${comment.id}`, "DELETE", {}, tokenB);
  assert.equal((await req(`/posts/${post.id}/comments`))[0].deleted, true);
  await req(
    `/posts/${post.id}/report`,
    "POST",
    { reason: "신고 테스트" },
    tokenB,
    201,
  );
  await req(
    `/posts/${post.id}/report`,
    "POST",
    { reason: "신고 수정" },
    tokenB,
    201,
  );
  assert.equal((await req("/reports", "GET", undefined, tokenB)).length, 1);
  assert.equal((await req("/reports")).length, 0);
  await req(
    `/garage/${car.id}`,
    "PUT",
    { model: "변조", year: 2024 },
    tokenB,
    403,
  );
  // 인증 무결성(MVP 단계 1): 모델·연식은 심사 중 수정 불가(409), 승인 차량에서 바꾸면 인증 해제, 그 외 필드는 상태 유지.
  const verification = async () =>
    (await db.query("SELECT verified,verification_status AS status,verified_at AS at FROM owner_vehicles WHERE id=$1", [car.id])).rows[0];
  const setVerification = (verified, status) =>
    db.query("UPDATE owner_vehicles SET verified=$2,verification_status=$3,verified_at=CASE WHEN $2 THEN NOW() END WHERE id=$1", [car.id, verified, status]);
  const edit = (body, expected = 200) =>
    req(`/garage/${car.id}`, "PUT", { model: "아반떼 N", year: 2024, trim: "DCT", imageId: image.id, ...body }, tokenA, expected);
  await setVerification(true, "APPROVED");
  await edit({ model: " 아반떼 N ", bio: "소개만 수정" });
  assert.deepEqual({ ...(await verification()), at: undefined }, { verified: true, status: "APPROVED", at: undefined });
  assert.ok((await verification()).at);
  await setVerification(false, "PENDING");
  await edit({ year: 2023 }, 409);
  await edit({ model: "아반떼 N 변경" }, 409);
  await edit({ bio: "심사 중 소개 수정" });
  assert.equal((await verification()).status, "PENDING");
  await setVerification(false, "REJECTED");
  await edit({ model: "아반떼 N 변경" });
  assert.equal((await verification()).status, "REJECTED");
  await edit({});
  for (const changed of [{ model: "아반떼 N 변경" }, { year: 2023 }]) {
    await setVerification(true, "APPROVED");
    await edit(changed);
    assert.deepEqual(await verification(), { verified: false, status: null, at: null });
    await edit({});
  }
  await edit({ year: 2023 }); // 신청 전(NULL)은 자유롭게 수정
  // Spring은 trim만 하고 저장하므로 board 정리(태그·보이지 않는 문자 제거)와 다를 수 있다. 저장값을 그대로 보낸 소개 수정은 모델 변경이 아니다.
  for (const status of ["APPROVED", "PENDING"]) {
    await db.query("UPDATE owner_vehicles SET model=$2,year=2024 WHERE id=$1", [car.id, "M3 <b>G80</b>\u200b"]);
    await setVerification(status === "APPROVED", status);
    await edit({ model: "M3 <b>G80</b>\u200b", bio: "소개만" });
    const after = await verification();
    assert.equal(after.status, status);
    assert.equal(after.verified, status === "APPROVED");
    assert.equal((await db.query("SELECT model FROM owner_vehicles WHERE id=$1", [car.id])).rows[0].model, "M3 <b>G80</b>\u200b");
  }
  await setVerification(false, null);
  await edit({});
  // 동시 요청: core 경로(인증 신청·관리자 승인)가 차량 행을 잡고 바꾸는 중이면 board 수정은 기다렸다가 커밋된 값으로 판단한다.
  const whileLocked = async (concurrentWrite, body, expected) => {
    const other = await db.connect();
    try {
      await other.query("BEGIN");
      await other.query("SELECT 1 FROM owner_vehicles WHERE id=$1 FOR UPDATE", [car.id]);
      let settled = false;
      const pending = edit(body, expected).finally(() => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(settled, false, "board 수정이 잠금을 기다려야 한다");
      await other.query(concurrentWrite, [car.id]);
      await other.query("COMMIT");
      await pending;
    } finally {
      other.release();
    }
  };
  await whileLocked("UPDATE owner_vehicles SET verification_status='PENDING' WHERE id=$1", { year: 2023 }, 409);
  assert.deepEqual(await verification(), { verified: false, status: "PENDING", at: null });
  assert.equal((await db.query("SELECT year FROM owner_vehicles WHERE id=$1", [car.id])).rows[0].year, 2024);
  await whileLocked("UPDATE owner_vehicles SET verified=true,verification_status='APPROVED',verified_at=NOW() WHERE id=$1", { bio: "승인 중 소개 수정" }, 200);
  assert.equal((await verification()).status, "APPROVED");
  assert.equal((await db.query("SELECT bio FROM owner_vehicles WHERE id=$1", [car.id])).rows[0].bio, "승인 중 소개 수정");
  await whileLocked("UPDATE owner_vehicles SET bio='core에서 바뀐 소개' WHERE id=$1", { model: "아반떼 N 변경" }, 200);
  assert.deepEqual(await verification(), { verified: false, status: null, at: null });
  await edit({});
  // Spring은 연식을 2100년까지 받는다. board 범위(올해+1) 밖의 저장된 연식은 그대로 보내면 받고(소개 수정 가능), 다른 값으로는 못 바꾼다.
  const farYear = new Date().getFullYear() + 5;
  await db.query("UPDATE owner_vehicles SET year=$2 WHERE id=$1", [car.id, farYear]);
  await setVerification(false, "PENDING");
  await edit({ year: farYear, bio: "먼 연식 소개 수정" });
  assert.equal((await verification()).status, "PENDING");
  await edit({ year: farYear + 1 }, 400);
  await setVerification(false, null);
  await edit({ year: farYear + 1 }, 400);
  await edit({});
  await req(`/garage/${car.id}`, "PUT", { model: "변조", year: 2024 }, tokenB, 403);
  await edit({});
  await setVerification(true, "APPROVED");
  await req(
    `/garage/${car.id}/records`,
    "POST",
    {
      kind: "maintenance",
      title: "오일 교체",
      date: "2026-09-20",
      mileage: 12000,
      cost: 90000,
    },
    tokenB,
    403,
  );
  const record = await req(
    `/garage/${car.id}/records`,
    "POST",
    {
      kind: "maintenance",
      title: "오일 교체",
      date: "2026-09-20",
      mileage: 12000,
      cost: 90000,
    },
    tokenA,
    201,
  );
  await req(
    `/garage/${car.id}/records`,
    "POST",
    { kind: "maintenance", title: "잘못된 날짜", date: "2026-02-31" },
    tokenA,
    400,
  );
  assert.equal((await req(`/garage/${car.id}`)).records[0].cost, 90000);
  await req(
    `/garage/${car.id}/records/${record.id}`,
    "DELETE",
    {},
    tokenB,
    403,
  );
  await req(`/garage/${car.id}/records/${record.id}`, "DELETE", {});
  assert.equal((await req("/members/1")).posts.length, 1);
  await req(`/posts/${post.id}/view`, "POST", {});
  assert.equal((await req(`/posts/${post.id}`)).views, 1);
  await req(`/posts/${post.id}/like`, "PUT", { active: false }, tokenB);
  assert.equal((await req(`/posts/${post.id}`)).likeCount, 0);
  await req(`/posts/${post.id}/bookmark`, "PUT", { active: false }, tokenB);
  assert.equal(
    (await req("/posts?scope=bookmarks", "GET", undefined, tokenB)).length,
    0,
  );
  await req(`/posts/${post.id}`, "DELETE", {});
  await req(`/posts/${post.id}`, "GET", undefined, tokenA, 404);
  assert.equal(
    (await req("/notifications", "GET", undefined, tokenB)).length,
    0,
  );
  await req(`/garage/${car.id}`, "DELETE", {});
  await req(`/garage/${car.id}`, "GET", undefined, tokenA, 404);
  console.log(
    "PASS: author profile/statistics, derived verification badge, private field exclusion, related filters, Flyway migrations, image validation, posts, search/categories, ownership, likes/bookmarks, comments/replies, notifications, reports, garage/records, garage verification integrity, cascade deletion.",
  );
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (db) await db.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
