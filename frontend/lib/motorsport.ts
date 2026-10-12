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

// 6 weeks (Sun–Sat) covering the month, so the grid height never jumps
// between months. Weeks fully outside the month still render (greyed) to
// keep the surrounding days visible for multi-day events near a boundary.
export function monthGrid(yearMonth: string): CalendarCell[][] {
  const first = `${yearMonth}-01`;
  const firstWeekday = new Date(`${first}T00:00:00Z`).getUTCDay(); // 0 = Sun
  const gridStart = addDays(first, -firstWeekday);
  const weeks: CalendarCell[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarCell[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(gridStart, w * 7 + d);
      week.push({date, inMonth: monthKey(date) === yearMonth});
    }
    weeks.push(week);
  }
  return weeks;
}

// Events whose [startsOn, endsOn] span includes `date` (venue-local dates).
export function eventsOnDate(events: PublicEvent[], date: string): PublicEvent[] {
  return events.filter((e) => e.startsOn <= date && date <= e.endsOn);
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
