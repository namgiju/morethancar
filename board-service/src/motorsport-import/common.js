// 공식 일정 수집기 공통 도구. 출처 어댑터(sources/*.js)는 아래 형태의 항목 목록을 돌려준다.
//
//   { key, series: {code,name,scope,officialUrl}|null, kind, title, startsOn, endsOn, startsAt, status,
//     sourceUrl, sourceName, bookingUrl, note, venue: {key,name,country,region,timezone,officialUrl} }
//
//  - startsOn/endsOn: 개최지 현지 날짜(YYYY-MM-DD). startsAt: 출처가 시각을 확정해 공개한 경우만 UTC ISO, 아니면 null.
//  - status: SCHEDULED, 또는 출처가 명시적으로 취소를 표시한 경우만 CANCELLED.
//  - 항목 하나를 해석하지 못하면(모르는 시간대·국가 등) 추측하지 않고 errors에 남기고 그 항목만 건너뛴다.
import { localDate, timezone } from "../motorsport.js";

// 연락처(이메일)는 넣지 않는다. 사이트 주소로 수집 주체만 밝힌다.
export const USER_AGENT = "morethancar-schedule/1.0 (+https://morethancar.kr)";
const TIMEOUT_MS = 20_000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 출처 하나에 요청을 보낼 때 앞 요청과 최소 간격을 둔다(하루 한 번 실행, 출처당 수십 건 이하).
export function politeFetcher({ fetchImpl = fetch, gapMs = 1500 } = {}) {
  let last = 0;
  return async function fetchText(url, { method = "GET", body, headers = {} } = {}) {
    const wait = last + gapMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const response = await fetchImpl(url, {
      method,
      body,
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ko,en;q=0.8", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
    return response.text();
  };
}

// 현지 시각("2026-10-25T15:00:00") + 오프셋("-05:00") → UTC ISO. 형식이 다르면 null(시각을 만들지 않는다).
export function instantFromLocal(local, offset) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local ?? "") || !/^[+-]\d{2}:\d{2}$/.test(offset ?? "")) return null;
  const date = new Date(local + offset);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// 절대 시각(ISO) → 시간대 zone의 현지 날짜.
export const localDateIn = (iso, zone) => localDate(new Date(iso), zone);

// 절대 시각이 장소 시간대 기준으로 startsOn~endsOn 안에 있는지(운영 API와 같은 규칙).
export function withinLocalDates(iso, zone, startsOn, endsOn) {
  const day = localDate(new Date(iso), zone);
  return day >= startsOn && day <= endsOn;
}

export function validZone(zone) {
  try {
    return timezone(zone);
  } catch {
    return null;
  }
}

// 시간대 zone에서 시각 iso의 UTC 오프셋(분). 출처가 준 오프셋과 대조할 때 쓴다.
export function zoneOffsetMinutes(iso, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - Date.parse(iso)) / 60_000);
}

export const htmlText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// 페이지의 schema.org JSON-LD 블록(@graph 포함)을 평평한 목록으로.
export function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      for (const item of [data].flat()) out.push(...(item["@graph"] ?? [item]));
    } catch {
      // 깨진 블록은 무시한다(다른 블록에 필요한 데이터가 있을 수 있다).
    }
  }
  return out;
}

export const cancelled = (eventStatus) => typeof eventStatus === "string" && /EventCancelled$/.test(eventStatus);

export const kstYear = (today) => Number(today.slice(0, 4));
