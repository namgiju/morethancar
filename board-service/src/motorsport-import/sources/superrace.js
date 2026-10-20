// 슈퍼레이스 챔피언십 — 주최 측 공식 사이트 super-race.com의 시즌 일정 페이지(HTML). 구조화된 데이터가 없어
// 라운드 상자(r_box)를 읽는다. 각 라운드에 주최 측 고유 번호(rid)가 있어 식별자로 쓴다(superrace:85).
//  - 대상: 용인 에버랜드 스피드웨이·인제 스피디움에서 열리는 라운드만(요청 범위). 그 밖의 서킷은 건너뛴다.
//  - 날짜만 공개된다(시각 없음). 연도는 페이지 제목("2026 SEASON")에서 읽는다.
//  - 페이지는 현재 시즌만 싣는다. 다음 시즌은 주최 측이 페이지를 바꾸면 수집된다.
// 요청: 하루 1건. robots.txt는 전체 허용.
import { htmlText } from "../common.js";

const URL = "https://www.super-race.com/inside/info_schedule.jsp";
const SERIES = { code: "superrace", name: "슈퍼레이스 챔피언십", scope: "DOMESTIC", officialUrl: "https://www.super-race.com" };
export const VENUES = {
  everland: { key: "kr:everland-speedway", name: "에버랜드 스피드웨이", country: "KR", region: "경기 용인", timezone: "Asia/Seoul", officialUrl: null },
  inje: { key: "kr:inje-speedium", name: "인제 스피디움", country: "KR", region: "강원 인제", timezone: "Asia/Seoul", officialUrl: "https://cc.speedium.co.kr" },
};

export function parseSchedule(html) {
  const year = html.match(/<title>\s*(\d{4})\s*SEASON/i)?.[1];
  if (!year) throw new Error("시즌 연도를 찾지 못함");
  const items = [];
  const boxes = [...html.matchAll(/<a href="\/ticket\/calendar\?rid=(\d+)">([\s\S]*?)<\/a>/g)];
  if (!boxes.length) throw new Error("라운드 목록을 찾지 못함");
  for (const [, rid, inner] of boxes) {
    const text = htmlText(inner);
    const m = text.match(/ROUND\.(\d+)\s+(.+?)\s+(\d{2})\.(\d{2})$/);
    if (!m) throw new Error(`rid=${rid}: 라운드 형식을 해석하지 못함 (${text})`);
    const [, round, place, month, day] = m;
    const venue = /EVERLAND/i.test(place) ? VENUES.everland : /INJE/i.test(place) ? VENUES.inje : null;
    if (!venue) continue;
    const date = `${year}-${month}-${day}`;
    items.push({
      key: `superrace:${rid}`,
      series: SERIES,
      kind: "RACE",
      title: `슈퍼레이스 ${year} R${round}${/NIGHT/i.test(place) ? " 나이트 레이스" : ""}`,
      startsOn: date,
      endsOn: date,
      startsAt: null,
      status: "SCHEDULED",
      sourceUrl: URL,
      sourceName: "슈퍼레이스 공식 사이트",
      bookingUrl: null,
      note: null,
      venue,
    });
  }
  return items;
}

export async function collect({ fetchText, today }) {
  try {
    return { items: parseSchedule(await fetchText(URL)).filter((i) => i.endsOn >= today), errors: [] };
  } catch (error) {
    return { items: [], errors: [error.message] };
  }
}
