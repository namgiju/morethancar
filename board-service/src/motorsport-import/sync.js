// 수집한 항목을 motorsport_events에 반영한다. 기존 운영 API와 같은 테이블·감사 로그(content_admin_logs)를 쓰고,
// 수행자는 수집 전용 운영자 계정(MOTORSPORT_IMPORT_USER_ID, MANAGER 이상)이다.
//
// 반영 규칙
//  - 새 일정: DRAFT로 넣는다(공개는 운영자가 관리자 화면에서). 이미 끝난 일정은 넣지 않는다(어댑터가 거른다).
//  - 같은 일정은 source_key로 찾는다(날짜·제목이 바뀌어도 같은 행). 삭제된 행은 건드리지 않는다.
//  - 출처 값이 바뀐 필드만 본다. 현재 값이 지난번 반영한 값(source_snapshot)과 같으면 갱신하고, 다르면 운영자가
//    고친 값이므로 덮어쓰지 않고 source_latest에만 남긴다 → 재확인 대기열에 뜬다(운영자가 확인하면 해소).
//  - 공개 중인 일정의 날짜·시각·장소를 갱신하면 진행 상태를 CHANGED로 표시한다. 취소는 출처가 명시한 경우만.
//  - 출처 목록에서 사라졌거나 수집에 실패한 일정은 삭제·취소하지 않는다(보고만 하고, 확인일이 오래되면 대기열에 뜬다).
//  - 공개 상태(publication)는 수집기가 바꾸지 않는다.
import { localDate } from "../motorsport.js";

export const FIELDS = ["title", "startsOn", "endsOn", "startsAt", "venueId", "status", "sourceUrl", "bookingUrl"];
const SCHEDULE_FIELDS = ["startsOn", "endsOn", "startsAt", "venueId"];
const same = (a, b) => (a ?? null) === (b ?? null);

// current: 지금 행의 값, snapshot: 지난번 반영한 출처 값, latest: 이번 출처 값 → {changes, snapshot, conflicts}
export function decide({ current, snapshot, latest, publication }) {
  const snap = snapshot ?? current;
  const changes = {}, conflicts = [];
  for (const field of FIELDS) {
    if (same(latest[field], snap[field])) continue; // 출처가 이 필드를 바꾸지 않았다
    // 수집기가 붙인 CHANGED는 운영자 수정으로 보지 않는다.
    const untouched = field === "status"
      ? current.status === snap.status || current.status === "CHANGED"
      : same(current[field], snap[field]);
    if (untouched) changes[field] = latest[field];
    else conflicts.push(field);
  }
  const nextSnapshot = { ...snap, ...changes };
  const scheduleMoved = SCHEDULE_FIELDS.some((f) => f in changes);
  if (scheduleMoved && publication !== "DRAFT") {
    const status = changes.status ?? current.status;
    if (status === "SCHEDULED") changes.status = "CHANGED";
  }
  return { changes, snapshot: nextSnapshot, conflicts };
}

// 반영 후 값이 기존 운영 API 규칙(기간 31일 이내, 시작 시각은 현지 날짜 범위 안)을 지키는지.
export function validSchedule({ startsOn, endsOn, startsAt }, zone) {
  if (endsOn < startsOn) return false;
  if ((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000 > 31) return false;
  if (!startsAt) return true;
  const day = localDate(new Date(startsAt), zone);
  return day >= startsOn && day <= endsOn;
}

const COLUMN = {
  title: "title", startsOn: "starts_on", endsOn: "ends_on", startsAt: "starts_at", venueId: "venue_id",
  status: "status", sourceUrl: "source_url", bookingUrl: "booking_url",
};

const log = (client, entityType, entityId, action, before, after, actor) =>
  client.query(
    `INSERT INTO content_admin_logs(entity_type,entity_id,action,before,after,actor_id,actor_role)
     VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
    [entityType, entityId, action, before && JSON.stringify(before), after && JSON.stringify(after), actor.id, actor.role],
  );
const rowOf = async (client, table, id) => (await client.query(`SELECT row_to_json(t) AS row FROM ${table} t WHERE t.id=$1`, [id])).rows[0].row;

async function ensureSeries(client, series, actor) {
  if (!series) return null;
  const found = await client.query("SELECT id FROM motorsport_series WHERE code=$1", [series.code]);
  if (found.rows.length) return found.rows[0].id;
  const { rows } = await client.query(
    "INSERT INTO motorsport_series(code,name,scope,official_url) VALUES($1,$2,$3,$4) RETURNING id",
    [series.code, series.name, series.scope, series.officialUrl],
  );
  await log(client, "MOTORSPORT_SERIES", rows[0].id, "CREATE", null, await rowOf(client, "motorsport_series", rows[0].id), actor);
  return rows[0].id;
}

async function ensureVenue(client, venue, actor) {
  const found = await client.query("SELECT id,timezone FROM motorsport_venues WHERE source_key=$1", [venue.key]);
  if (found.rows.length) return found.rows[0];
  const { rows } = await client.query(
    `INSERT INTO motorsport_venues(name,country,region,timezone,official_url,source_key)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id,timezone`,
    [venue.name, venue.country, venue.region, venue.timezone, venue.officialUrl, venue.key],
  );
  await log(client, "MOTORSPORT_VENUE", rows[0].id, "CREATE", null, await rowOf(client, "motorsport_venues", rows[0].id), actor);
  return rows[0];
}

const eventColumns = `id,title,to_char(starts_on,'YYYY-MM-DD') AS "startsOn",to_char(ends_on,'YYYY-MM-DD') AS "endsOn",
 to_char(starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",venue_id AS "venueId",status,
 source_url AS "sourceUrl",booking_url AS "bookingUrl",publication,source_snapshot AS snapshot,deleted_at AS "deletedAt"`;

// 항목 하나를 반영한다(호출 쪽 트랜잭션 안). 결과: inserted | updated | conflict | unchanged | deleted
export async function applyItem(client, item, { actor, today }) {
  const seriesId = await ensureSeries(client, item.series, actor);
  const venue = await ensureVenue(client, item.venue, actor);
  const latest = {
    title: item.title, startsOn: item.startsOn, endsOn: item.endsOn, startsAt: item.startsAt, venueId: venue.id,
    status: item.status, sourceUrl: item.sourceUrl, bookingUrl: item.bookingUrl,
  };
  if (!validSchedule(latest, venue.timezone)) throw new Error(`${item.key}: 기간·시각이 장소 시간대 기준으로 맞지 않음`);
  const found = (await client.query(`SELECT ${eventColumns} FROM motorsport_events WHERE source_key=$1 FOR UPDATE`, [item.key])).rows[0];

  if (!found) {
    const { rows } = await client.query(
      `INSERT INTO motorsport_events(series_id,venue_id,kind,title,starts_on,ends_on,starts_at,status,source_url,source_name,
         verified_on,verified_by,note,created_by,booking_url,source_key,source_snapshot,source_latest,source_checked_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$12,$14,$15,$16::jsonb,$16::jsonb,NOW()) RETURNING id`,
      [seriesId, venue.id, item.kind, item.title, item.startsOn, item.endsOn, item.startsAt, item.status, item.sourceUrl,
        item.sourceName, today, actor.id, item.note, item.bookingUrl, item.key, JSON.stringify(latest)],
    );
    await log(client, "MOTORSPORT_EVENT", rows[0].id, "CREATE", null, await rowOf(client, "motorsport_events", rows[0].id), actor);
    return { result: "inserted", id: rows[0].id };
  }
  if (found.deletedAt) return { result: "deleted", id: found.id };

  const current = Object.fromEntries(FIELDS.map((f) => [f, found[f]]));
  const { changes, snapshot, conflicts } = decide({ current, snapshot: found.snapshot, latest, publication: found.publication });
  // 바뀐 값만 반영했을 때 규칙이 깨지면(예: 날짜는 운영자가 고쳤고 시각만 바뀜) 일정 필드는 반영하지 않고 확인을 맡긴다.
  if (!validSchedule({ ...current, ...changes }, venue.timezone)) {
    for (const f of SCHEDULE_FIELDS) if (f in changes) { delete changes[f]; snapshot[f] = found.snapshot?.[f] ?? current[f]; conflicts.push(f); }
    if (changes.status === "CHANGED") delete changes.status;
  }
  const columns = Object.keys(changes);
  const before = columns.length ? await rowOf(client, "motorsport_events", found.id) : null;
  // 충돌이 없으면 출처로 다시 확인한 것이므로 확인일도 갱신한다($6). 충돌이 있으면 확인일은 운영자 확인 때 바뀐다.
  await client.query(
    `UPDATE motorsport_events SET source_snapshot=$2::jsonb,source_latest=$3::jsonb,source_checked_at=NOW(),
       verified_on=CASE WHEN $6::boolean THEN $4::date ELSE verified_on END,
       verified_by=CASE WHEN $6::boolean THEN $5::bigint ELSE verified_by END,
       updated_by=CASE WHEN $7::boolean THEN $5::bigint ELSE updated_by END,
       updated_at=CASE WHEN $7::boolean THEN NOW() ELSE updated_at END
       ${columns.map((f, i) => `,${COLUMN[f]}=$${i + 8}`).join("")}
     WHERE id=$1`,
    [found.id, JSON.stringify(snapshot), JSON.stringify(latest), today, actor.id, !conflicts.length, columns.length > 0,
      ...columns.map((f) => changes[f])],
  );
  if (columns.length) await log(client, "MOTORSPORT_EVENT", found.id, "UPDATE", before, await rowOf(client, "motorsport_events", found.id), actor);
  return { result: conflicts.length ? "conflict" : columns.length ? "updated" : "unchanged", id: found.id, changes, conflicts };
}
