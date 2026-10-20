// F1 — 공식 사이트 formula1.com. 공개 API·ICS가 없어(동기화 버튼은 외부 ECAL 위젯) 공식 페이지에 들어 있는
// 구조화된 데이터를 읽는다.
//  - 시즌 페이지(/en/racing/{연도}): 경기 페이지 링크 목록만 쓴다.
//  - 경기 페이지: Next.js가 내려보내는 `race` 객체(meetingKey, 현지 개최일, IANA 시간대, 세션별 시각과
//    sessionStatus)와 schema.org JSON-LD의 eventStatus(취소 여부).
//  - 결승 시각은 sessionStatus가 "TBC"가 아닐 때만 쓴다. TBC인 세션의 시각 값은 화면에 "TBC"로 표시되는 임시값이다.
// 요청: 시즌 페이지 2개(올해·내년) + 아직 끝나지 않은 경기 페이지. robots.txt는 /en/racing을 막지 않는다.
import { cancelled, instantFromLocal, jsonLd, kstYear, validZone, withinLocalDates } from "../common.js";

const BASE = "https://www.formula1.com";
const SERIES = { code: "f1", name: "Formula 1", scope: "INTERNATIONAL", officialUrl: "https://www.formula1.com" };

// formula1.com의 국가 코드(일부는 ISO가 아닌 IOC식) → ISO 3166-1 alpha-2. 없는 코드는 추측하지 않고 오류로 남긴다.
const COUNTRY = {
  ARE: "AE", UAE: "AE", AUS: "AU", AUT: "AT", AZE: "AZ", BEL: "BE", BHR: "BH", BRN: "BH", BRA: "BR", CAN: "CA",
  CHN: "CN", ESP: "ES", GBR: "GB", HUN: "HU", ITA: "IT", JPN: "JP", KSA: "SA", SAU: "SA", MCO: "MC", MON: "MC",
  MEX: "MX", NED: "NL", NLD: "NL", POR: "PT", PRT: "PT", QAT: "QA", SGP: "SG", TUR: "TR", USA: "US",
};

// Next.js RSC 조각(self.__next_f.push([1,"..."]))을 이어 붙인 원문.
function rscText(html) {
  let out = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) out += JSON.parse(m[1]);
  return out;
}

// text에서 marker 바로 뒤의 JSON 객체를 괄호 짝으로 잘라 파싱한다.
export function objectAfter(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const start = text.indexOf("{", at + marker.length - 1);
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}

export function seasonLinks(html, year) {
  return [...new Set([...html.matchAll(new RegExp(`href="(/en/racing/${year}/[a-z0-9-]+)"`, "g"))].map((m) => BASE + m[1]))];
}

// 경기 페이지 하나 → 항목. 해석할 수 없으면 Error를 던진다(호출 쪽이 errors에 남긴다).
export function parseMeeting(html, url) {
  const race = objectAfter(rscText(html), '"race":{');
  if (!race?.meetingKey || !race.meetingStartDate || !race.meetingEndDate) throw new Error(`${url}: 경기 데이터(race)를 찾지 못함`);
  const zone = validZone(race.meetingTimezone);
  if (!zone) throw new Error(`${url}: 알 수 없는 시간대 ${race.meetingTimezone}`);
  const country = COUNTRY[race.meetingCountryCode];
  if (!country) throw new Error(`${url}: 국가 코드 대응 없음 ${race.meetingCountryCode}`);
  // meetingStartDate/EndDate는 현지 날짜를 자정 Z로 적은 값이다(예: 2026-10-23T00:00:00.000Z → 현지 10월 23일).
  const startsOn = race.meetingStartDate.slice(0, 10), endsOn = race.meetingEndDate.slice(0, 10);
  const final = (race.meetingSessions ?? []).find((s) => s.session === "r");
  let startsAt = final && final.sessionStatus !== "TBC" ? instantFromLocal(final.startTime, final.gmtOffset) : null;
  if (startsAt && !withinLocalDates(startsAt, zone, startsOn, endsOn)) startsAt = null;
  const event = jsonLd(html).find((item) => item["@type"] === "SportsEvent" && Array.isArray(item.subEvent));
  return {
    key: `f1:${race.meetingKey}`,
    series: SERIES,
    kind: race.type === "race" ? "RACE" : "EVENT",
    title: race.meetingName,
    startsOn,
    endsOn,
    startsAt,
    status: cancelled(event?.eventStatus) ? "CANCELLED" : "SCHEDULED",
    sourceUrl: url,
    sourceName: "Formula 1 공식 사이트",
    bookingUrl: null,
    note: null,
    venue: {
      key: `f1-circuit:${race.circuitKey}`,
      name: race.circuitOfficialName,
      country,
      region: race.circuitLocation || null,
      timezone: zone,
      officialUrl: null,
    },
  };
}

export async function collect({ fetchText, today, skipUrls = new Set() }) {
  const items = [], errors = [];
  for (const year of [kstYear(today), kstYear(today) + 1]) {
    let links;
    try {
      links = seasonLinks(await fetchText(`${BASE}/en/racing/${year}`), year);
    } catch (error) {
      errors.push(`${year} 시즌 페이지: ${error.message}`);
      continue;
    }
    // 내년 시즌이 아직 발표되지 않았으면 링크가 없다(오류 아님). 올해 시즌에 링크가 없으면 페이지 구조가 바뀐 것이다.
    if (!links.length && year === kstYear(today)) errors.push(`${year} 시즌 페이지에서 경기 링크를 찾지 못함`);
    for (const url of links) {
      if (skipUrls.has(url)) continue;
      try {
        const item = parseMeeting(await fetchText(url), url);
        if (item.endsOn >= today) items.push(item);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }
  return { items, errors };
}
