// NASCAR Cup Series — nascar.com이 쓰는 공식 일정 JSON 피드(cf.nascar.com/cacher/{연도}/1/schedule-feed.json, 1 = Cup).
// 세션별 행(연습·예선·결승)에 race_id, 트랙, 현지 시각(start_time)과 UTC 시각(start_time_utc)이 있다.
//  - 일정 하나 = race_id 하나. 기간은 세션들의 현지 날짜 범위, 시각은 결승(run_type 3) 시작 시각.
//  - 피드에 시간대가 없어 트랙 → IANA 시간대 표를 둔다. 표에 없거나, 표의 시간대로 계산한 오프셋이 피드의
//    현지·UTC 차이와 다르면 추측하지 않고 오류로 남긴다.
//  - 내년 피드가 비어 있으면(아직 반영 전) 0건으로 끝난다. 취소 표시 필드가 없어 취소는 반영하지 않는다.
// 요청: 하루 2건(올해·내년).
import { kstYear, zoneOffsetMinutes } from "../common.js";

const SERIES = { code: "nascar-cup", name: "NASCAR Cup Series", scope: "INTERNATIONAL", officialUrl: "https://www.nascar.com/nascar-cup-series/" };
const feed = (year) => `https://cf.nascar.com/cacher/${year}/1/schedule-feed.json`;
const SCHEDULE_PAGE = "https://www.nascar.com/nascar-cup-series/schedule/";

// 트랙 이름 → [IANA 시간대, 주(州)]. 모두 미국.
const TRACKS = {
  "Atlanta Motor Speedway": ["America/New_York", "Georgia"],
  "Bowman Gray Stadium": ["America/New_York", "North Carolina"],
  "Bristol Motor Speedway": ["America/New_York", "Tennessee"],
  "Charlotte Motor Speedway": ["America/New_York", "North Carolina"],
  "Chicagoland Speedway": ["America/Chicago", "Illinois"],
  "Circuit of The Americas": ["America/Chicago", "Texas"],
  "Darlington Raceway": ["America/New_York", "South Carolina"],
  "Daytona International Speedway": ["America/New_York", "Florida"],
  "Dover Motor Speedway": ["America/New_York", "Delaware"],
  "Homestead-Miami Speedway": ["America/New_York", "Florida"],
  "Indianapolis Motor Speedway": ["America/Indiana/Indianapolis", "Indiana"],
  "Iowa Speedway": ["America/Chicago", "Iowa"],
  "Kansas Speedway": ["America/Chicago", "Kansas"],
  "Las Vegas Motor Speedway": ["America/Los_Angeles", "Nevada"],
  "Martinsville Speedway": ["America/New_York", "Virginia"],
  "Michigan International Speedway": ["America/Detroit", "Michigan"],
  "Nashville Superspeedway": ["America/Chicago", "Tennessee"],
  "New Hampshire Motor Speedway": ["America/New_York", "New Hampshire"],
  "North Wilkesboro Speedway": ["America/New_York", "North Carolina"],
  "Phoenix Raceway": ["America/Phoenix", "Arizona"],
  "Pocono Raceway": ["America/New_York", "Pennsylvania"],
  "Richmond Raceway": ["America/New_York", "Virginia"],
  "San Diego Street Course": ["America/Los_Angeles", "California"],
  "Sonoma Raceway": ["America/Los_Angeles", "California"],
  "Talladega Superspeedway": ["America/Chicago", "Alabama"],
  "Texas Motor Speedway": ["America/Chicago", "Texas"],
  "Watkins Glen International": ["America/New_York", "New York"],
  "World Wide Technology Raceway": ["America/Chicago", "Illinois"],
};

const utc = (value) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value ?? "") ? `${value}.000Z` : null);
// 현지 시각과 UTC 시각의 차이(분).
const feedOffset = (row) => Math.round((Date.parse(`${row.start_time}Z`) - Date.parse(utc(row.start_time_utc))) / 60_000);

export function parseFeed(rows, today) {
  const items = [], errors = [];
  const byRace = new Map();
  for (const row of rows) if (row.series_id === 1) byRace.set(row.race_id, [...(byRace.get(row.race_id) ?? []), row]);
  for (const [raceId, sessions] of byRace) {
    const days = sessions.map((s) => s.start_time.slice(0, 10)).sort();
    if (days[days.length - 1] < today) continue; // 끝난 경기는 보지 않는다
    const track = sessions[0].track_name;
    const [zone, region] = TRACKS[track] ?? [];
    if (!zone) {
      errors.push(`nascar:${raceId}: 트랙 시간대 대응 없음 ${track}`);
      continue;
    }
    if (sessions.some((s) => !utc(s.start_time_utc) || zoneOffsetMinutes(utc(s.start_time_utc), zone) !== feedOffset(s))) {
      errors.push(`nascar:${raceId}: ${track} 시간대(${zone})가 피드의 현지 시각과 맞지 않음`);
      continue;
    }
    const final = sessions.find((s) => s.run_type === 3);
    // 자정(00:00)은 시각 미정을 뜻하는 경우가 있어 시각으로 쓰지 않는다.
    const startsAt = final && !final.start_time.endsWith("T00:00:00") ? new Date(utc(final.start_time_utc)).toISOString() : null;
    items.push({
      key: `nascar:${raceId}`,
      series: SERIES,
      kind: "RACE",
      title: sessions[0].race_name,
      startsOn: days[0],
      endsOn: days[days.length - 1],
      startsAt,
      status: "SCHEDULED",
      sourceUrl: SCHEDULE_PAGE,
      sourceName: "NASCAR 공식 일정",
      bookingUrl: null,
      note: null,
      venue: { key: `nascar-track:${sessions[0].track_id}`, name: track, country: "US", region, timezone: zone, officialUrl: null },
    });
  }
  return { items, errors };
}

export async function collect({ fetchText, today }) {
  const items = [], errors = [];
  for (const year of [kstYear(today), kstYear(today) + 1]) {
    try {
      const rows = JSON.parse(await fetchText(feed(year)));
      if (!Array.isArray(rows)) throw new Error("배열이 아님");
      const parsed = parseFeed(rows, today);
      items.push(...parsed.items);
      errors.push(...parsed.errors);
    } catch (error) {
      errors.push(`${year} 피드: ${error.message}`);
    }
  }
  return { items, errors };
}
