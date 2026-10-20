import test from "node:test";
import assert from "node:assert/strict";
import { decide, validSchedule } from "../src/motorsport-import/sync.js";
import { parseMeeting, seasonLinks } from "../src/motorsport-import/sources/f1.js";
import { instantFromLocal, zoneOffsetMinutes } from "../src/motorsport-import/common.js";
import { parseFeed } from "../src/motorsport-import/sources/nascar.js";
import { parseSchedule as parseLeMans } from "../src/motorsport-import/sources/lemans.js";
import { parseSchedule as parseSuperrace } from "../src/motorsport-import/sources/superrace.js";
import { parseMonth, toItems } from "../src/motorsport-import/sources/inje.js";

const base = { title: "A", startsOn: "2026-10-23", endsOn: "2026-10-25", startsAt: null, venueId: 1, status: "SCHEDULED", sourceUrl: "u", bookingUrl: null };

test("decide: unchanged source changes nothing", () => {
  assert.deepEqual(decide({ current: base, snapshot: base, latest: base, publication: "DRAFT" }), { changes: {}, snapshot: base, conflicts: [] });
});

test("decide: draft takes source changes as is", () => {
  const latest = { ...base, startsOn: "2026-10-24" };
  const { changes, snapshot, conflicts } = decide({ current: base, snapshot: base, latest, publication: "DRAFT" });
  assert.deepEqual(changes, { startsOn: "2026-10-24" });
  assert.equal(snapshot.startsOn, "2026-10-24");
  assert.deepEqual(conflicts, []);
});

test("decide: published schedule change marks CHANGED, operator status edits are kept", () => {
  const latest = { ...base, startsAt: "2026-10-25T20:00:00.000Z" };
  assert.deepEqual(decide({ current: base, snapshot: base, latest, publication: "PUBLISHED" }).changes,
    { startsAt: "2026-10-25T20:00:00.000Z", status: "CHANGED" });
  // 운영자가 TENTATIVE로 둔 일정은 CHANGED로 바꾸지 않는다.
  const tentative = { ...base, status: "TENTATIVE" };
  assert.deepEqual(decide({ current: tentative, snapshot: base, latest, publication: "PUBLISHED" }).changes,
    { startsAt: "2026-10-25T20:00:00.000Z" });
});

test("decide: operator-edited field is a conflict, other fields still apply", () => {
  const current = { ...base, title: "운영자 제목" };
  const latest = { ...base, title: "B", endsOn: "2026-10-26" };
  const { changes, snapshot, conflicts } = decide({ current, snapshot: base, latest, publication: "DRAFT" });
  assert.deepEqual(changes, { endsOn: "2026-10-26" });
  assert.deepEqual(conflicts, ["title"]);
  assert.equal(snapshot.title, "A"); // 충돌한 필드의 snapshot은 그대로 → latest와 달라 대기열에 남는다
});

test("decide: explicit cancel applies over importer CHANGED", () => {
  const current = { ...base, status: "CHANGED" };
  const latest = { ...base, status: "CANCELLED" };
  assert.deepEqual(decide({ current, snapshot: base, latest, publication: "PUBLISHED" }).changes, { status: "CANCELLED" });
});

test("validSchedule: start time must fall on the venue-local dates", () => {
  assert.equal(validSchedule({ startsOn: "2026-11-19", endsOn: "2026-11-21", startsAt: "2026-11-22T04:00:00.000Z" }, "America/Los_Angeles"), true);
  assert.equal(validSchedule({ startsOn: "2026-11-19", endsOn: "2026-11-21", startsAt: "2026-11-22T04:00:00.000Z" }, "Asia/Seoul"), false);
  assert.equal(validSchedule({ startsOn: "2026-11-21", endsOn: "2026-11-19", startsAt: null }, "Asia/Seoul"), false);
});

test("common: local time + offset, zone offsets", () => {
  assert.equal(instantFromLocal("2026-10-25T15:00:00", "-05:00"), "2026-10-25T20:00:00.000Z");
  assert.equal(instantFromLocal("2026-10-25", "-05:00"), null);
  assert.equal(zoneOffsetMinutes("2026-10-25T20:00:00.000Z", "America/Chicago"), -300);
  assert.equal(zoneOffsetMinutes("2026-11-08T20:00:00.000Z", "America/New_York"), -300);
});

const rsc = (race) => `<script>self.__next_f.push([1,${JSON.stringify(`3:{"race":${JSON.stringify(race)}}`)}])</script>`;
const meeting = {
  type: "race", meetingKey: "1297", meetingName: "United States Grand Prix", meetingStartDate: "2026-10-23T00:00:00.000Z",
  meetingEndDate: "2026-10-25T23:59:59.999Z", meetingTimezone: "US/Central", meetingCountryCode: "USA", circuitKey: "9",
  circuitOfficialName: "Circuit of The Americas", circuitLocation: "Austin",
  meetingSessions: [{ session: "r", startTime: "2026-10-25T15:00:00", gmtOffset: "-05:00" }],
};

test("f1: season links and meeting parse", () => {
  const links = seasonLinks('<a href="/en/racing/2027/bahrain"></a><a href="/en/racing/2027/bahrain"></a><a href="/en/racing/2026/x"></a>', 2027);
  assert.deepEqual(links, ["https://www.formula1.com/en/racing/2027/bahrain"]);
  const item = parseMeeting(rsc(meeting), "https://www.formula1.com/en/racing/2026/united-states");
  assert.deepEqual([item.key, item.kind, item.startsOn, item.endsOn, item.startsAt, item.status, item.venue.key, item.venue.country],
    ["f1:1297", "RACE", "2026-10-23", "2026-10-25", "2026-10-25T20:00:00.000Z", "SCHEDULED", "f1-circuit:9", "US"]);
});

test("f1: TBC time is not stored, explicit cancel is, unknown codes are errors", () => {
  const tbc = { ...meeting, meetingSessions: [{ ...meeting.meetingSessions[0], sessionStatus: "TBC" }] };
  assert.equal(parseMeeting(rsc(tbc), "u").startsAt, null);
  const ld = '<script type="application/ld+json">{"@type":"SportsEvent","eventStatus":"https://schema.org/EventCancelled","subEvent":[]}</script>';
  assert.equal(parseMeeting(ld + rsc(meeting), "u").status, "CANCELLED");
  assert.throws(() => parseMeeting(rsc({ ...meeting, meetingCountryCode: "XXX" }), "u"), /국가 코드/);
  assert.throws(() => parseMeeting(rsc({ ...meeting, meetingTimezone: "Mars/Base" }), "u"), /시간대/);
  assert.throws(() => parseMeeting("<html></html>", "u"), /race/);
});


const session = (o) => ({ series_id: 1, race_id: 5631, race_name: "YellaWood 500", track_id: 82, track_name: "Talladega Superspeedway", ...o });

test("nascar: one event per race, final start time, zone checked against feed offsets", () => {
  const rows = [
    session({ run_type: 2, start_time: "2026-10-24T12:00:00", start_time_utc: "2026-10-24T17:00:00" }),
    session({ run_type: 3, start_time: "2026-10-25T13:00:00", start_time_utc: "2026-10-25T18:00:00" }),
    session({ race_id: 1, run_type: 3, start_time: "2026-02-15T14:30:00", start_time_utc: "2026-02-15T19:30:00" }), // 끝난 경기
  ];
  const { items, errors } = parseFeed(rows, "2026-10-20");
  assert.deepEqual(errors, []);
  assert.deepEqual(items.map((i) => [i.key, i.startsOn, i.endsOn, i.startsAt, i.venue.timezone]),
    [["nascar:5631", "2026-10-24", "2026-10-25", "2026-10-25T18:00:00.000Z", "America/Chicago"]]);
  // 표의 시간대와 피드 오프셋이 다르면(예: 동부 시각으로 적힌 행) 추측하지 않는다.
  const wrong = parseFeed([session({ run_type: 3, start_time: "2026-10-25T14:00:00", start_time_utc: "2026-10-25T18:00:00" })], "2026-10-20");
  assert.equal(wrong.items.length, 0);
  assert.match(wrong.errors[0], /시간대/);
  assert.match(parseFeed([session({ track_name: "Unknown Oval", run_type: 3, start_time: "2026-10-25T13:00:00", start_time_utc: "2026-10-25T18:00:00" })], "2026-10-20").errors[0], /대응 없음/);
});

test("le mans: race start to chequered flag in Paris dates", () => {
  const ld = { "@type": "SportsEvent", name: "24 Hours of Le Mans 2027", eventStatus: "https://schema.org/EventScheduled",
    startDate: "2027-06-04T08:00:00.000Z", subEvent: [
      { name: "Scrutineering", startDate: "2027-06-04T08:00:00.000Z" },
      { name: "Start of the 95th edition", startDate: "2027-06-12T14:00:00.000Z" },
      { name: "Chequered Flag", startDate: "2027-06-13T14:00:00.000Z" }] };
  const item = parseLeMans(`<script type="application/ld+json">${JSON.stringify({ "@graph": [ld] })}</script>`);
  assert.deepEqual([item.key, item.startsOn, item.endsOn, item.startsAt], ["le-mans-24h:2027", "2027-06-12", "2027-06-13", "2027-06-12T14:00:00.000Z"]);
  ld.subEvent.splice(1, 1);
  assert.throws(() => parseLeMans(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`), /출발/);
});

test("superrace: only Everland/Inje rounds, keyed by organizer rid, dates only", () => {
  const box = (rid, round, place, date) => `<a href="/ticket/calendar?rid=${rid}"><div class="txt"><strong class="eng">ROUND.${round} <p>${place}</p></strong><p class="data">${date}</p></div></a>`;
  const html = `<title>2026 SEASON - 2026 일정</title>${box(85, 4, "INJE SPEEDIUM <br>CIRCUIT", "07.18")}${box(87, 6, "KOREA INTERNATIONAL <br>CIRCUIT", "09.13")}${box(86, 5, "EVERLAND <br>SPEEDWAY NIGHT <br>COURSE", "08.22")}`;
  assert.deepEqual(parseSuperrace(html).map((i) => [i.key, i.startsOn, i.venue.key, i.title, i.startsAt]), [
    ["superrace:85", "2026-07-18", "kr:inje-speedium", "슈퍼레이스 2026 R4", null],
    ["superrace:86", "2026-08-22", "kr:everland-speedway", "슈퍼레이스 2026 R5 나이트 레이스", null],
  ]);
  assert.throws(() => parseSuperrace("<title>x</title>"), /연도/);
});

test("inje: explicit sport-driving days only, races grouped, rentals/bikes/superrace skipped", () => {
  const day = (date, color, bnum, subject) => `<a href='javascript:;' class='sch_b_day Calover' date='${date}'><p>1</p><div class="schedulebox ${color}_day"><p class="subject font_${color}_day" data-bnum='${bnum}'>${subject}</p></div></a>`;
  const html = `<table id="calendar">${[
    day("2026-10-10", "green", 1, "인제GT마스터즈"), day("2026-10-11", "green", 2, "인제GT마스터즈"),
    day("2026-10-14", "yellow", 3, "정규시즌 스포츠주행"), day("2026-10-17", "gray", 4, "기업임대"),
    day("2026-10-21", "gray", 5, "트랙데이"), day("2026-10-25", "green", 6, "인제 바이크마스터즈"),
    day("2026-07-18", "green", 7, "슈퍼레이스"),
  ].join("")}</table>`;
  const items = toItems(parseMonth(html));
  assert.deepEqual(items.map((i) => [i.key, i.kind, i.startsOn, i.endsOn, i.title, Boolean(i.bookingUrl)]), [
    ["inje:3", "TRACK_DAY", "2026-10-14", "2026-10-14", "인제 스피디움 스포츠주행", true],
    ["inje:1", "RACE", "2026-10-10", "2026-10-11", "인제GT마스터즈", false],
  ]);
  assert.throws(() => parseMonth("<html></html>"), /달력/);
});
