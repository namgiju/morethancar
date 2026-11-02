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
  // 사용자가 마크업만 지운 모델은 실제 변경이다(저장값으로 되돌리지 않는다).
  await setVerification(false, null);
  await edit({ model: "M3 G80" });
  assert.equal((await db.query("SELECT model FROM owner_vehicles WHERE id=$1", [car.id])).rows[0].model, "M3 G80");
  // board 정리로는 빈 값이 되는(text()가 거부하는) 저장 모델도 그대로 보내면 심사 중 소개를 고칠 수 있다.
  await db.query("UPDATE owner_vehicles SET model='<b></b>' WHERE id=$1", [car.id]);
  await setVerification(false, "PENDING");
  await edit({ model: "<b></b>", bio: "정리 불가 모델 소개 수정" });
  assert.equal((await verification()).status, "PENDING");
  await edit({ model: "<i></i>" }, 400);
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
  // 차량 보관(MVP 단계 2): 보관·복원, 타인 403, 심사 중 409, 대표 차량 해제, 인장 계산 제외, 기록·연결 글 유지.
  await req("/profile/representative-vehicle", "PUT", { vehicleId: car.id });
  const linkedPost = await req("/posts", "POST", { title: "보관 전 연결 글", content: "내용", category: "free", vehicleId: car.id }, tokenA, 201);
  await req(`/garage/${car.id}/archive`, "PATCH", { archived: true }, tokenB, 403);
  await req(`/garage/${car.id}/archive`, "PATCH", { archived: "yes" }, tokenA, 400);
  await setVerification(false, "PENDING");
  await req(`/garage/${car.id}/archive`, "PATCH", { archived: true }, tokenA, 409);
  await setVerification(true, "APPROVED");
  const archivedCar = await req(`/garage/${car.id}/archive`, "PATCH", { archived: true });
  assert.ok(archivedCar.archivedAt);
  assert.equal((await db.query("SELECT representative_vehicle_id FROM member_profiles WHERE user_id=1")).rows[0].representative_vehicle_id, null);
  const archivedMember = await req("/members/1", "GET", undefined, "");
  assert.equal(archivedMember.verified, false);
  assert.deepEqual(archivedMember.badges, []);
  assert.equal(archivedMember.representativeVehicle, null);
  assert.ok(archivedMember.vehicles.find((v) => v.id === car.id).archivedAt);
  assert.ok((await req("/garage/mine")).find((v) => v.id === car.id).archivedAt);
  await req("/profile/representative-vehicle", "PUT", { vehicleId: car.id }, tokenA, 400);
  // 글 작성자 표시(ownerVehicle)도 보관 차량은 쓰지 않는다.
  assert.equal((await req(`/posts/${post.id}`)).ownerVehicle, null);
  await req("/profile/representative-vehicle", "PUT", { vehicleId: car.id }, tokenB, 403);
  assert.equal((await req(`/garage/${car.id}`)).records.length, 1);
  assert.equal((await verification()).status, "APPROVED");
  const archivedPostDetail = await req(`/posts/${linkedPost.id}`);
  assert.equal(archivedPostDetail.vehicleId, car.id);
  assert.equal(archivedPostDetail.linkedVehicle.archived, true);
  // 보관 차량은 새 글·다른 글에 새로 연결할 수 없고, 이미 연결된 글은 그대로 수정할 수 있다.
  await req("/posts", "POST", { title: "새 글", content: "내용", category: "free", vehicleId: car.id }, tokenA, 400);
  await req(`/posts/${post.id}`, "PUT", { ...draft, vehicleId: car.id }, tokenA, 400);
  await req(`/posts/${linkedPost.id}`, "PUT", { title: "보관 후 수정", content: "내용", category: "free", vehicleId: car.id });
  assert.equal((await req(`/posts/${linkedPost.id}`)).vehicleId, car.id);
  const restored = await req(`/garage/${car.id}/archive`, "PATCH", { archived: false });
  assert.equal(restored.archivedAt, null);
  const restoredMember = await req("/members/1", "GET", undefined, "");
  assert.equal(restoredMember.verified, true);
  assert.equal(restoredMember.representativeVehicle.id, car.id);
  assert.equal((await req(`/posts/${post.id}`)).ownerVehicle, "아반떼 N");
  assert.equal((await req(`/posts/${linkedPost.id}`)).linkedVehicle.archived, false);
  await req(`/posts/${linkedPost.id}`, "DELETE", {});
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
  // 부품 장착·탈거 이력(MVP 단계 3): 소유권·검증·비용 비공개·비공개 사진·다른 차량 경로·삭제·차량 삭제 CASCADE.
  const partImage = await req("/images", "POST", { data: png }, tokenA, 201);
  const otherImage = await req("/images", "POST", { data: png }, tokenB, 201);
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 33 * 3600 * 1000).toISOString().slice(0, 10);
  const tire = { brand: "Michelin", name: "Pilot Sport 4S", spec: "245/40R18", installedOn: "2025-03-02", installMileage: 12000, cost: 1200000, imageIds: [partImage.id] };
  // 입력 검증(남의 사진 400 등)이 소유권(403)보다 먼저다 — records와 같은 순서.
  await req(`/garage/${car.id}/parts`, "POST", { ...tire, imageIds: [] }, tokenB, 403);
  await req(`/garage/${car.id}/parts`, "POST", tire, "", 401);
  for (const bad of [
    { installedOn: "2025-02-30" }, { installedOn: tomorrow }, { brand: "" }, { name: undefined },
    { removedOn: "2025-03-01" }, { removedOn: "2025-04-01", removeMileage: 11000 }, { isPublic: "no" },
    { imageIds: [otherImage.id] }, { imageIds: [partImage.id, 1, 2, 3] }, { cost: -1 }, { installMileage: 2000001 },
  ])
    await req(`/garage/${car.id}/parts`, "POST", { ...tire, ...bad }, tokenA, 400);
  await req(`/garage/${car.id}/parts`, "POST", { ...tire, installedOn: kstToday }, tokenA, 201).then((p) => req(`/garage/${car.id}/parts/${p.id}`, "DELETE", {}));
  const part = await req(`/garage/${car.id}/parts`, "POST", tire, tokenA, 201);
  const hidden = await req(`/garage/${car.id}/parts`, "POST", { brand: "Brembo", name: "GT 키트", installedOn: "2024-05-01", cost: 3000000, isPublic: false, imageIds: [] }, tokenA, 201);
  // 비공개 부품 사진·비공개 부품: 소유자만. 공개 부품 사진은 누구나.
  const privateImage = await req("/images", "POST", { data: png }, tokenA, 201);
  await req(`/garage/${car.id}/parts/${hidden.id}`, "PUT", { brand: "Brembo", name: "GT 키트", installedOn: "2024-05-01", cost: 3000000, isPublic: false, imageIds: [privateImage.id] });
  assert.equal((await fetch(base + `/images/${partImage.id}`)).status, 200);
  assert.equal((await fetch(base + `/images/${privateImage.id}`)).status, 404);
  // 캐시(MVP 단계 6-b): 공개 사진 public 1시간, 소유자에게만 보이는 비공개 사진 private no-store, 404 no-store.
  assert.equal((await fetch(base + `/images/${partImage.id}`)).headers.get("cache-control"), "public, max-age=3600");
  assert.equal((await fetch(base + `/images/${partImage.id}`, { headers: { Cookie: `REVCC_SESSION=${tokenA}` } })).headers.get("cache-control"), "public, max-age=3600");
  assert.equal((await fetch(base + `/images/${privateImage.id}`, { headers: { Cookie: `REVCC_SESSION=${tokenA}` } })).headers.get("cache-control"), "private, no-store");
  assert.equal((await fetch(base + `/images/${privateImage.id}`)).headers.get("cache-control"), "no-store");
  assert.equal((await fetch(base + "/images/999999")).headers.get("cache-control"), "no-store");
  assert.equal((await fetch(base + `/images/${privateImage.id}`, { headers: { Cookie: `REVCC_SESSION=${tokenB}` } })).status, 404);
  assert.equal((await fetch(base + `/images/${privateImage.id}`, { headers: { Cookie: `REVCC_SESSION=${tokenA}` } })).status, 200);
  const ownerView = (await req(`/garage/${car.id}`)).parts;
  assert.deepEqual(ownerView.map((p) => [p.id, p.cost, p.isPublic, p.hasPhoto]), [[part.id, 1200000, true, true], [hidden.id, 3000000, false, true]]);
  for (const token of [tokenB, ""]) {
    const view = await req(`/garage/${car.id}`, "GET", undefined, token);
    assert.deepEqual(view.parts.map((p) => p.id), [part.id]);
    assert.ok(!("cost" in view.parts[0]));
    assert.ok(!JSON.stringify(view.parts).includes("1200000"));
  }
  // 수정·탈거(PUT): 타인 403, 다른 차량 경로 — 남의 차량이면 403, 내 다른 차량이면 404. vehicle_id는 바뀌지 않는다.
  const otherCar = await req("/garage", "POST", { model: "K5", year: 2021 }, tokenB, 201);
  const removal = { ...tire, removedOn: "2025-10-01", removeMileage: 21000, vehicleId: otherCar.id };
  const removalB = { ...removal, imageIds: [] };
  await req(`/garage/${car.id}/parts/${part.id}`, "PUT", removalB, tokenB, 403);
  await req(`/garage/${otherCar.id}/parts/${part.id}`, "PUT", removalB, tokenB, 404);
  await req(`/garage/${otherCar.id}/parts/${part.id}`, "PUT", removal, tokenA, 403);
  await req(`/garage/${otherCar.id}/parts/${part.id}`, "DELETE", {}, tokenB, 404);
  await req(`/garage/${car.id}/parts/${part.id}`, "PUT", { ...removal, removeMileage: 100 }, tokenA, 400);
  await req(`/garage/${car.id}/parts/${part.id}`, "PUT", removal);
  const removed = (await db.query("SELECT vehicle_id,removed_on::text AS r,remove_mileage FROM vehicle_parts WHERE id=$1", [part.id])).rows[0];
  assert.deepEqual(removed, { vehicle_id: car.id, r: "2025-10-01", remove_mileage: 21000 });
  assert.deepEqual((await req(`/garage/${car.id}`)).parts.map((p) => [p.id, p.removedOn]), [[hidden.id, null], [part.id, "2025-10-01"]]);
  // DB CHECK도 같은 규칙을 막는다(API 우회 방어).
  await assert.rejects(db.query("UPDATE vehicle_parts SET removed_on='2020-01-01' WHERE id=$1", [part.id]), /check/);
  // 글이 부품을 가리켜도 부품을 지우면 part_id만 NULL(글은 남는다). 지운 부품의 사진은 더 이상 공개되지 않는다(사진 행은 남음, 알려진 제한).
  const partPost = await req("/posts", "POST", { title: "타이어 후기", content: "내용", category: "free" }, tokenA, 201);
  await db.query("UPDATE board_posts SET part_id=$1 WHERE id=$2", [part.id, partPost.id]);
  await req(`/garage/${car.id}/parts/${part.id}`, "DELETE", {}, tokenB, 403);
  await req(`/garage/${car.id}/parts/${part.id}`, "DELETE", {});
  await req(`/garage/${car.id}/parts/${part.id}`, "DELETE", {}, tokenA, 404);
  assert.equal((await db.query("SELECT part_id FROM board_posts WHERE id=$1", [partPost.id])).rows[0].part_id, null);
  await req(`/posts/${partPost.id}`);
  assert.equal((await fetch(base + `/images/${partImage.id}`)).status, 404);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM community_images WHERE id=$1", [partImage.id])).rows[0].n, 1);
  await req(`/posts/${partPost.id}`, "DELETE", {});
  await req(`/garage/${otherCar.id}`, "DELETE", {}, tokenB);
  // 후기 연결·공개 차고(MVP 단계 4).
  // 정비 기록 비용·심사 상태는 소유자에게만, 번호판은 누구에게도 내려가지 않는다.
  await req(`/garage/${car.id}/records`, "POST", { kind: "maintenance", title: "브레이크 패드", date: "2026-09-01", cost: 150000 }, tokenA, 201);
  const ownGarage = await req(`/garage/${car.id}`);
  assert.equal(ownGarage.records[0].cost, 150000);
  assert.equal(ownGarage.verificationStatus, "APPROVED");
  for (const token of [tokenB, ""]) {
    const view = await req(`/garage/${car.id}`, "GET", undefined, token);
    assert.ok(view.records.length && view.records.every((r) => !("cost" in r)));
    assert.ok(!("verificationStatus" in view));
    assert.equal(view.verified, true);
    assert.equal(view.archivedAt, null);
    assert.ok(view.createdAt);
    assert.ok(!JSON.stringify(view).includes("150000") && !JSON.stringify(view).includes("PRIVATE-PLATE"));
  }
  const pub = await req(`/garage/${car.id}/parts`, "POST", { brand: "Ohlins", name: "DFV", installedOn: "2025-03-02", installMileage: 12000, cost: 2500000 }, tokenA, 201);
  // 부품만 고르면 차량은 그 부품의 차량으로 채워진다. 글에는 공개 부품의 장착 정보(비용 없음)가 붙고, partId는 작성자만 본다.
  const review = await req("/posts", "POST", { title: "DFV 후기", content: "좋다", category: "parts", partId: pub.id }, tokenA, 201);
  let reviewDetail = await req(`/posts/${review.id}`);
  assert.equal(reviewDetail.vehicleId, car.id);
  assert.equal(reviewDetail.partId, pub.id);
  assert.deepEqual(reviewDetail.linkedPart, { id: pub.id, brand: "Ohlins", name: "DFV", spec: "", installedOn: "2025-03-02", removedOn: null, installMileage: 12000, removeMileage: null, hasPhoto: false });
  for (const token of [tokenB, ""]) {
    const other = await req(`/posts/${review.id}`, "GET", undefined, token);
    assert.equal(other.partId, null);
    assert.equal(other.linkedPart.id, pub.id);
    assert.ok(!JSON.stringify(other).includes("2500000"));
  }
  // 남의 부품 403, 다른 차량의 부품 400.
  const carB = await req("/garage", "POST", { model: "Ray", year: 2020 }, tokenB, 201);
  const partB = await req(`/garage/${carB.id}/parts`, "POST", { brand: "BBS", name: "LM", installedOn: "2024-01-01" }, tokenB, 201);
  await req("/posts", "POST", { title: "x", content: "x", category: "parts", partId: partB.id }, tokenA, 403);
  const carA2 = await req("/garage", "POST", { model: "Veloster N", year: 2022 }, tokenA, 201);
  await req("/posts", "POST", { title: "x", content: "x", category: "parts", vehicleId: carA2.id, partId: pub.id }, tokenA, 400);
  // 수정: partId 없으면 유지, null이면 해제(차량은 유지), 다시 연결, 차량만 바꾸면 부품 연결 해제.
  const reviewBody = { title: "DFV 후기", content: "좋다", category: "parts" };
  await req(`/posts/${review.id}`, "PUT", reviewBody);
  assert.equal((await req(`/posts/${review.id}`)).partId, pub.id);
  await req(`/posts/${review.id}`, "PUT", { ...reviewBody, partId: null });
  reviewDetail = await req(`/posts/${review.id}`);
  assert.deepEqual([reviewDetail.partId, reviewDetail.linkedPart, reviewDetail.vehicleId], [null, null, car.id]);
  await req(`/posts/${review.id}`, "PUT", { ...reviewBody, partId: pub.id });
  assert.equal((await req(`/posts/${review.id}`)).linkedPart.id, pub.id);
  await req(`/posts/${review.id}`, "PUT", { ...reviewBody, vehicleId: carA2.id });
  reviewDetail = await req(`/posts/${review.id}`);
  assert.deepEqual([reviewDetail.vehicleId, reviewDetail.partId], [carA2.id, null]);
  await req(`/posts/${review.id}`, "PUT", { ...reviewBody, vehicleId: car.id, partId: pub.id });
  // 비공개 부품: 연결은 되지만 장착 정보 박스는 누구에게도(작성자 포함) 없다. 공개 차고 posts[]의 partId도 숨는다.
  await req(`/garage/${car.id}/parts/${pub.id}`, "PUT", { brand: "Ohlins", name: "DFV", installedOn: "2025-03-02", installMileage: 12000, cost: 2500000, isPublic: false });
  assert.equal((await req(`/posts/${review.id}`)).linkedPart, null);
  assert.equal((await req(`/posts/${review.id}`, "GET", undefined, tokenB)).linkedPart, null);
  assert.equal((await req(`/garage/${car.id}`, "GET", undefined, tokenB)).posts.find((p) => p.id === review.id).partId, null);
  assert.equal((await req(`/garage/${car.id}`)).posts.find((p) => p.id === review.id).partId, pub.id);
  await req(`/garage/${car.id}/parts/${pub.id}`, "PUT", { brand: "Ohlins", name: "DFV", installedOn: "2025-03-02", installMileage: 12000, cost: 2500000, isPublic: true });
  const publicGarage = await req(`/garage/${car.id}`, "GET", undefined, "");
  assert.deepEqual(publicGarage.posts.find((p) => p.id === review.id), { id: review.id, title: "DFV 후기", category: "parts", createdAt: publicGarage.posts.find((p) => p.id === review.id).createdAt, partId: pub.id });
  // 보관 차량의 부품은 새 글에 연결할 수 없고, 이미 연결된 글은 그대로 수정할 수 있다.
  const partA2 = await req(`/garage/${carA2.id}/parts`, "POST", { brand: "Bilstein", name: "B16", installedOn: "2024-06-01" }, tokenA, 201);
  const archivedReview = await req("/posts", "POST", { title: "B16", content: "x", category: "parts", partId: partA2.id }, tokenA, 201);
  await req(`/garage/${carA2.id}/archive`, "PATCH", { archived: true });
  await req("/posts", "POST", { title: "x", content: "x", category: "parts", partId: partA2.id }, tokenA, 400);
  await req(`/posts/${post.id}`, "PUT", { ...draft, partId: partA2.id }, tokenA, 400);
  await req(`/posts/${archivedReview.id}`, "PUT", { title: "B16 수정", content: "x", category: "parts", partId: partA2.id });
  assert.equal((await req(`/posts/${archivedReview.id}`)).linkedPart.id, partA2.id);
  // 글 삭제(soft)는 부품에 영향 없음. 차량 영구 삭제 → 부품 CASCADE, 글의 vehicle_id·part_id는 NULL(글은 남는다).
  await req(`/posts/${archivedReview.id}`, "DELETE", {});
  assert.equal((await db.query("SELECT count(*)::int AS n FROM vehicle_parts WHERE id=$1", [partA2.id])).rows[0].n, 1);
  await db.query("UPDATE board_posts SET deleted=false,deleted_at=NULL,deleted_by=NULL,deleted_reason=NULL WHERE id=$1", [archivedReview.id]);
  await req(`/garage/${carA2.id}`, "DELETE", {});
  assert.equal((await db.query("SELECT count(*)::int AS n FROM vehicle_parts WHERE vehicle_id=$1", [carA2.id])).rows[0].n, 0);
  assert.deepEqual((await db.query("SELECT vehicle_id,part_id FROM board_posts WHERE id=$1", [archivedReview.id])).rows[0], { vehicle_id: null, part_id: null });
  const orphan = await req(`/posts/${archivedReview.id}`);
  assert.deepEqual([orphan.vehicleId, orphan.linkedPart, orphan.linkedVehicle], [null, null, null]);
  for (const id of [review.id, archivedReview.id]) await req(`/posts/${id}`, "DELETE", {});
  await req(`/garage/${carB.id}`, "DELETE", {}, tokenB);
  await req(`/garage/${car.id}`, "DELETE", {});
  await req(`/garage/${car.id}`, "GET", undefined, tokenA, 404);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM vehicle_parts WHERE vehicle_id=$1", [car.id])).rows[0].n, 0);
  console.log(
    "PASS: author profile/statistics, derived verification badge, private field exclusion, related filters, Flyway migrations, image validation, posts, search/categories, ownership, likes/bookmarks, comments/replies, notifications, reports, garage/records, garage verification integrity, vehicle archive, vehicle parts, part reviews/public garage, cascade deletion.",
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
