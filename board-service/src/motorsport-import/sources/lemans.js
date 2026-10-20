// 르망 24시 — 주최 측(ACO) 공식 사이트 24h-lemans.com의 일정 페이지 JSON-LD(SportsEvent + subEvent).
//  - 상위 행사는 차량 검사부터 시상까지의 주간 전체라, 일정은 결승 출발("Start of the …")부터 체커기("Chequered Flag")
//    까지로 잡는다. 두 하위 행사 중 하나라도 없으면 추측하지 않고 오류로 남긴다.
//  - 출발 시각은 하위 행사의 시각을 그대로 쓴다(페이지에 현지 16:00으로 표시되는 값과 같다).
//  - 페이지는 다가오는 대회 하나만 싣는다. 식별자는 대회 연도(le-mans-24h:2027).
// 요청: 하루 1건. robots.txt는 /api만 막는다.
import { cancelled, jsonLd, localDateIn } from "../common.js";

const URL = "https://www.24h-lemans.com/en/schedule";
const ZONE = "Europe/Paris";
const SERIES = { code: "le-mans-24h", name: "르망 24시", scope: "INTERNATIONAL", officialUrl: "https://www.24h-lemans.com" };

export function parseSchedule(html) {
  const event = jsonLd(html).find((item) => item["@type"] === "SportsEvent" && /24 Hours of Le Mans/i.test(item.name ?? ""));
  if (!event) throw new Error("르망 24시 일정(JSON-LD SportsEvent)을 찾지 못함");
  const subs = event.subEvent ?? [];
  const start = subs.find((s) => /^Start of the/i.test(s.name ?? ""));
  const finish = subs.find((s) => /^Chequered Flag/i.test(s.name ?? ""));
  if (!start?.startDate || !finish?.startDate) throw new Error("결승 출발·체커기 시각을 찾지 못함");
  const startsAt = new Date(start.startDate).toISOString();
  const year = localDateIn(startsAt, ZONE).slice(0, 4);
  return {
    key: `le-mans-24h:${year}`,
    series: SERIES,
    kind: "RACE",
    title: event.name,
    startsOn: localDateIn(startsAt, ZONE),
    endsOn: localDateIn(finish.startDate, ZONE),
    startsAt,
    status: cancelled(event.eventStatus) ? "CANCELLED" : "SCHEDULED",
    sourceUrl: URL,
    sourceName: "24 Hours of Le Mans 공식 사이트",
    bookingUrl: null,
    note: null,
    venue: { key: "fr:circuit-des-24-heures", name: "Circuit des 24 Heures du Mans", country: "FR", region: "Le Mans", timezone: ZONE, officialUrl: "https://www.24h-lemans.com" },
  };
}

export async function collect({ fetchText, today }) {
  try {
    const item = parseSchedule(await fetchText(URL));
    return { items: item.endsOn >= today ? [item] : [], errors: [] };
  } catch (error) {
    return { items: [], errors: [error.message] };
  }
}
