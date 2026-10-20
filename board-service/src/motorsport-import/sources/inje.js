// 인제 스피디움 — 서킷 공식 사이트의 "서킷일정" 달력(cc.speedium.co.kr). 공개 API·ICS가 없어 달력 화면이 불러오는
// 월별 조각(get_calendar_2018.jsp)을 읽는다. 날짜마다 일정 이름, 분류 색, 고유 번호(data-bnum)가 있다.
//  - 일반 주행: 일정 이름에 "스포츠주행"이 명시된 날만 TRACK_DAY로 넣는다(경기가 없는 날을 주행 가능일로 보지 않는다).
//    하루 = 일정 하나(inje:{bnum}). 세션 시간표는 공식 안내 페이지에 이미지로만 있어 시각은 저장하지 않고 안내 링크를 둔다.
//    예약 안내 링크만 저장하고 예약 가능 여부·잔여석은 수집하지 않는다.
//  - 공식 경기: 달력의 "대회/행사"(green_day) 일정. 같은 이름이 이어지는 날은 한 일정으로 묶는다(inje:{첫날 bnum}).
//    이륜(바이크) 대회는 제외하고, 슈퍼레이스는 주최 측 출처(superrace.js)가 맡으므로 제외한다.
//  - 서킷 임대·점검일은 넣지 않는다.
//  - 이 출처에는 일정 단위의 안정 식별자가 없어 날짜별 번호를 쓴다. 주최 측이 날짜를 옮기면 새 번호의 새 일정이
//    생기고, 옛 일정은 "출처에서 사라짐"으로 보고된다(자동으로 취소·삭제하지 않는다).
// 주소: 443 포트는 다른 도메인 인증서를 내보내므로 사이트가 리다이렉트하는 8443 포트를 쓴다(인증서 검증 유지).
// 요청: 하루 4건(이번 달부터 3개월 뒤까지). robots.txt는 전체 허용.
import { VENUES } from "./superrace.js";

const ORIGIN = "https://cc.speedium.co.kr:8443";
const CALENDAR = `${ORIGIN}/common/file/get_calendar_2018.jsp`;
const detail = (bnum) => `${ORIGIN}/content/05contest/01_01.jsp?proc_type=view&b_num=${bnum}`;
const BOOKING = "https://www.speedium.co.kr/shop2019/content/01circuit/01_01.jsp";
const MONTHS_AHEAD = 3;
const TRACK_DAY_NOTE = "정규시즌 스포츠주행일. 세션 시간표는 공식 안내를 확인하세요(날씨·경기장 사정으로 바뀔 수 있음). " +
  "서킷 라이선스가 필요하며, 예약 가능 여부와 잔여석은 예약 페이지에서 확인하세요.";

const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

// 월별 조각 → [{date, color, bnum, subject}]
export function parseMonth(html) {
  if (!/<table id="calendar">/.test(html)) throw new Error("달력 형식을 찾지 못함");
  const entries = [];
  for (const [, date, inner] of html.matchAll(/date='(\d{4}-\d{2}-\d{2})'>([\s\S]*?)<\/a>/g))
    for (const [, color, bnum, subject] of inner.matchAll(/<p class="subject font_([a-z]+)_day" data-bnum='(\d+)'>([\s\S]*?)<\/p>/g))
      entries.push({ date, color, bnum, subject: decode(subject) });
  return entries;
}

const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function toItems(entries) {
  const items = [];
  for (const e of entries.filter((x) => x.color === "yellow" && /스포츠주행/.test(x.subject)))
    items.push({
      key: `inje:${e.bnum}`, series: null, kind: "TRACK_DAY", title: "인제 스피디움 스포츠주행",
      startsOn: e.date, endsOn: e.date, startsAt: null, status: "SCHEDULED",
      sourceUrl: detail(e.bnum), sourceName: "인제 스피디움 서킷일정", bookingUrl: BOOKING, note: TRACK_DAY_NOTE, venue: VENUES.inje,
    });
  const races = entries
    .filter((x) => x.color === "green" && !/바이크|모터사이클|슈퍼레이스/i.test(x.subject))
    .sort((a, b) => a.date.localeCompare(b.date));
  let current = null;
  for (const e of races) {
    if (current && current.title === e.subject && nextDay(current.endsOn) === e.date) {
      current.endsOn = e.date;
      continue;
    }
    current = {
      key: `inje:${e.bnum}`, series: null, kind: "RACE", title: e.subject,
      startsOn: e.date, endsOn: e.date, startsAt: null, status: "SCHEDULED",
      sourceUrl: detail(e.bnum), sourceName: "인제 스피디움 서킷일정", bookingUrl: null, note: null, venue: VENUES.inje,
    };
    items.push(current);
  }
  return items;
}

export async function collect({ fetchText, today }) {
  const entries = [], errors = [];
  let [year, month] = today.split("-").map(Number);
  for (let i = 0; i <= MONTHS_AHEAD; i++) {
    try {
      const html = await fetchText(CALENDAR, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `a_num=2114821&year=${year}&month=${month}`,
      });
      entries.push(...parseMonth(html));
    } catch (error) {
      errors.push(`${year}-${month} 달력: ${error.message}`);
    }
    [year, month] = month === 12 ? [year + 1, 1] : [year, month + 1];
  }
  // 이어지는 경기가 달을 넘어가도 한 일정으로 묶이도록 전체를 모은 뒤 변환한다.
  return { items: toItems(entries).filter((i) => i.endsOn >= today), errors };
}
