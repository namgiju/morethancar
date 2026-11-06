// Date helpers for the public /motorsport pages. Pure functions only (no
// fetching) so the calendar math can be reasoned about and reused by the
// calendar grid, the list view and the home page preview alike.
import type {EventPhase, PublicEvent} from './motorsport-types';

const DAY_MS = 86_400_000;

// Same rule as board-service's kstToday() (no DST in KST, so a fixed offset
// is safe): "today" for a visitor is always KST, regardless of their device.
export function kstToday(now: number = Date.now()): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
}

// Upcoming / ongoing / ended, purely from the venue-local date range vs KST
// today. Distinct from the server's `status` (SCHEDULED/TENTATIVE/…, about
// how reliable the schedule is, not about timing) — both are shown.
export function eventPhase(event: Pick<PublicEvent, 'startsOn' | 'endsOn'>, today: string = kstToday()): EventPhase {
  if (today < event.startsOn) return 'upcoming';
  if (today > event.endsOn) return 'ended';
  return 'ongoing';
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function addMonthsToKey(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return `${y}년 ${m}월`;
}

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

// First–last day of a month (venue-local date strings, same shape the public
// events API takes as from/to).
export function monthRange(yearMonth: string): {from: string; to: string} {
  const from = `${yearMonth}-01`;
  const to = addDays(addDays(`${addMonthsToKey(yearMonth, 1)}-01`, 0), -1);
  return {from, to};
}

export type CalendarCell = {date: string; inMonth: boolean};

// Only the Sun–Sat weeks the month actually touches (4–6). Leading/trailing
// days of the neighbouring months fill the first and last week (greyed), so
// multi-day events crossing a month boundary stay visible as one bar.
export function monthGrid(yearMonth: string): CalendarCell[][] {
  const first = `${yearMonth}-01`;
  const firstWeekday = new Date(`${first}T00:00:00Z`).getUTCDay(); // 0 = Sun
  const gridStart = addDays(first, -firstWeekday);
  const {to: last} = monthRange(yearMonth);
  const days = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${gridStart}T00:00:00Z`)) / DAY_MS) + 1;
  const weekCount = Math.ceil(days / 7);
  const weeks: CalendarCell[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const week: CalendarCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d);
      week.push({date, inMonth: monthKey(date) === yearMonth});
    }
    weeks.push(week);
  }
  return weeks;
}

// First and last date the grid shows (incl. greyed neighbour-month days) —
// the calendar fetches this whole range so bars on those days aren't missing.
export function gridRange(yearMonth: string): {from: string; to: string} {
  const weeks = monthGrid(yearMonth);
  return {from: weeks[0][0].date, to: weeks[weeks.length - 1][6].date};
}

// Events whose [startsOn, endsOn] span includes `date` (venue-local dates).
export function eventsOnDate(events: PublicEvent[], date: string): PublicEvent[] {
  return events.filter((e) => e.startsOn <= date && date <= e.endsOn);
}

export function overlapsRange(event: Pick<PublicEvent, 'startsOn' | 'endsOn'>, from: string, to: string): boolean {
  return event.startsOn <= to && event.endsOn >= from;
}

export type WeekSegment<E> = {
  event: E;
  start: number; // column 0–6 (Sun–Sat)
  span: number; // 1–7 columns
  lane: number; // 0-based row under the date numbers
  continuesBefore: boolean; // event started in an earlier week
  continuesAfter: boolean; // event goes on into the next week
};

// One week row of the calendar: each event overlapping the week becomes a
// single bar segment with one lane for the whole week (so a multi-day event
// keeps its row), stacked so segments never overlap. Among bars starting in
// the same column the longer event (whole duration, not just this week) gets
// the upper lane, so a multi-day event isn't pushed into "+N" by a one-day
// one; ties break by id for a stable order.
const length = (e: Pick<PublicEvent, 'startsOn' | 'endsOn'>) => Date.parse(`${e.endsOn}T00:00:00Z`) - Date.parse(`${e.startsOn}T00:00:00Z`);

export function weekSegments<E extends Pick<PublicEvent, 'id' | 'startsOn' | 'endsOn'>>(weekDates: string[], events: E[]): WeekSegment<E>[] {
  const first = weekDates[0];
  const last = weekDates[weekDates.length - 1];
  const segments = events
    .filter((e) => overlapsRange(e, first, last))
    .map((event) => {
      const startDate = event.startsOn < first ? first : event.startsOn;
      const endDate = event.endsOn > last ? last : event.endsOn;
      const start = weekDates.indexOf(startDate);
      const end = weekDates.indexOf(endDate);
      return {event, start, span: end - start + 1, lane: 0, continuesBefore: event.startsOn < first, continuesAfter: event.endsOn > last};
    })
    .sort((a, b) => a.start - b.start || length(b.event) - length(a.event) || a.event.startsOn.localeCompare(b.event.startsOn) || a.event.id - b.event.id);
  const lanes: boolean[][] = [];
  for (const seg of segments) {
    let lane = 0;
    while (lanes[lane]?.slice(seg.start, seg.start + seg.span).some(Boolean)) lane++;
    lanes[lane] ??= Array(7).fill(false);
    for (let c = seg.start; c < seg.start + seg.span; c++) lanes[lane][c] = true;
    seg.lane = lane;
  }
  return segments;
}

// Per column (0–6), how many events sit in lanes the calendar can't show.
export function hiddenCounts(segments: WeekSegment<unknown>[], maxLanes: number): number[] {
  const counts = Array(7).fill(0);
  for (const seg of segments) {
    if (seg.lane < maxLanes) continue;
    for (let c = seg.start; c < seg.start + seg.span; c++) counts[c]++;
  }
  return counts;
}

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

// "11월 6일 (금)" from a venue-local YYYY-MM-DD (no time zone conversion —
// the string already is the local calendar date).
export function localDateLabel(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = WEEKDAY_SHORT[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${withYear ? `${y}년 ` : ''}${m}월 ${d}일 (${weekday})`;
}

// "2026년 11월 6일 (금) – 11월 8일 (일)" (year repeated only when it changes).
export function localRangeLabel(startsOn: string, endsOn: string): string {
  if (startsOn === endsOn) return localDateLabel(startsOn, true);
  return `${localDateLabel(startsOn, true)} – ${localDateLabel(endsOn, startsOn.slice(0, 4) !== endsOn.slice(0, 4))}`;
}

// "11월 7일 (토) 오전 12:30" in KST. The date is included because the KST day
// often differs from the venue-local date range shown next to it.
export function kstDateTimeLabel(iso: string): string {
  const instant = new Date(iso);
  const date = new Date(instant.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  return `${localDateLabel(date)} ${kstTimeLabel(iso)}`;
}

// Calendar bar colour + short series label. Colour is never the only cue:
// the label is always printed on the bar too.
const SERIES_STYLE: Record<string, {label: string; color: string}> = {
  f1: {label: 'F1', color: '#d7261e'},
  wec: {label: 'WEC', color: '#1f5fbf'},
  'super-race': {label: '슈퍼레이스', color: '#0f7a55'},
};
const FALLBACK_COLORS = ['#7a4cc2', '#b35c00', '#00798a', '#a1306b'];
const KIND_STYLE: Record<PublicEvent['kind'], {label: string; color: string}> = {
  RACE: {label: '경기', color: '#5f6368'},
  TRACK_DAY: {label: '스포츠주행', color: '#4a7300'},
  EVENT: {label: '행사', color: '#5f6368'},
};

export function seriesStyle(event: Pick<PublicEvent, 'kind' | 'series'>): {label: string; color: string} {
  const series = event.series;
  if (!series) return KIND_STYLE[event.kind];
  const known = SERIES_STYLE[series.code];
  if (known) return known;
  let hash = 0;
  for (const ch of series.code) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return {label: series.name, color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length]};
}

// "10.25" or "10.25 – 10.27" (same month) or "9.30 – 10.2" (crosses months).
export function dateRangeLabel(startsOn: string, endsOn: string): string {
  const [, sm, sd] = startsOn.split('-');
  const [, em, ed] = endsOn.split('-');
  const start = `${Number(sm)}.${Number(sd)}`;
  if (startsOn === endsOn) return start;
  return `${start} – ${sm === em ? Number(ed) : `${Number(em)}.${Number(ed)}`}`;
}

// KST clock time from a UTC instant, "오후 2:00" style (startsAt is only set
// when the organizer published a time; many entries only have dates).
export function kstTimeLabel(startsAtIso: string): string {
  return new Date(startsAtIso).toLocaleTimeString('ko-KR', {timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit'});
}

// ISO 3166-1 alpha-2 → Korean country name ("KR" → "대한민국"). Falls back to
// the code itself if the runtime's Intl data doesn't know it.
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['ko'], {type: 'region'}).of(code) ?? code;
  } catch {
    return code;
  }
}

// Bar text without a repeated series prefix ("F1 상파울루 그랑프리" next to the
// "F1" label → "상파울루 그랑프리"). Display only; the panel shows the full title.
export function barTitle(title: string, label: string): string {
  const prefix = `${label} `;
  return title.startsWith(prefix) && title.length > prefix.length ? title.slice(prefix.length) : title;
}
