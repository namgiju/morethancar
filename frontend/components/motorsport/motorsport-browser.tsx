'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {fetchEvents} from '../../lib/motorsport-api';
import {gridRange, kstToday, monthKey, monthRange, overlapsRange} from '../../lib/motorsport';
import type {EventKind, PublicEvent, SeriesScope} from '../../lib/motorsport-types';
import MotorsportFilters from './motorsport-filters';
import MotorsportCalendar, {type CalendarSelection} from './motorsport-calendar';
import MotorsportEventPanel from './motorsport-event-panel';
import MotorsportList from './motorsport-list';
import styles from './motorsport.module.css';

const isKind = (value: string | null): value is EventKind => value === 'RACE' || value === 'TRACK_DAY' || value === 'EVENT';
const isScope = (value: string | null): value is SeriesScope => value === 'DOMESTIC' || value === 'INTERNATIONAL';
const isMonth = (value: string | null): value is string => !!value && /^\d{4}-\d{2}$/.test(value);
const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isId = (value: string | null): value is string => !!value && /^[1-9]\d{0,9}$/.test(value);

// Below this width the detail opens as a bottom sheet and bars get fewer lanes
// (same breakpoint as motorsport.module.css).
const MOBILE_QUERY = '(max-width: 600px)';
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}

// /motorsport — 공개 캘린더·리스트. board-service의 공개 API만 쓴다
// (/api/board/motorsport/events, 로그인 불필요). 월·보기·필터·선택한 날짜를
// URL과 동기화해 공유 가능한 주소로 만든다. 선택한 일정은 ?event=ID, "+N개"로 연 날짜 목록은
// ?date=YYYY-MM-DD(예전 날짜 선택 주소도 그대로 날짜 목록으로 열린다)(components/community/community-list.tsx와 같은 방식).
export default function MotorsportBrowser() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = kstToday();

  const [view, setView] = useState<'calendar' | 'list'>(() => (searchParams.get('view') === 'list' ? 'list' : 'calendar'));
  const [month, setMonth] = useState(() => {
    const value = searchParams.get('month');
    return isMonth(value) ? value : monthKey(today);
  });
  const [kind, setKind] = useState<EventKind | ''>(() => {
    const value = searchParams.get('kind');
    return isKind(value) ? value : '';
  });
  const [scope, setScope] = useState<SeriesScope | ''>(() => {
    const value = searchParams.get('scope');
    return isScope(value) ? value : '';
  });
  const [selection, setSelection] = useState<CalendarSelection>(() => {
    const id = searchParams.get('event');
    if (isId(id)) return {type: 'event', id: Number(id)};
    const date = searchParams.get('date');
    return isDate(date) ? {type: 'day', date} : null;
  });
  // Event opened from a day list keeps a way back to that list.
  const [fromDate, setFromDate] = useState<string | null>(null);
  // The calendar control that opened the panel — focus goes back there on close.
  const origin = useRef<HTMLElement | null>(null);
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  const mobile = useIsMobile();

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== 'calendar') params.set('view', view);
    if (month !== monthKey(today)) params.set('month', month);
    if (kind) params.set('kind', kind);
    if (scope) params.set('scope', scope);
    if (selection?.type === 'event') params.set('event', String(selection.id));
    if (selection?.type === 'day') params.set('date', selection.date);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, {scroll: false});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, month, kind, scope, selection]);

  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const ticket = useRef(0);

  useEffect(() => {
    const current = ++ticket.current;
    setLoading(true);
    setFailed(false);
    // The whole visible grid (incl. greyed neighbour-month days), so bars on
    // those days are complete. The list view still shows only this month.
    const {from, to} = gridRange(month);
    fetchEvents({from, to, kind, scope, limit: 200})
      .then(({events: rows}) => {
        if (current !== ticket.current) return;
        setEvents(rows);
      })
      .catch(() => {
        if (current === ticket.current) setFailed(true);
      })
      .finally(() => {
        if (current === ticket.current) setLoading(false);
      });
  }, [month, kind, scope]);

  function changeMonth(next: string) {
    setMonth(next);
    setSelection(null);
    setFromDate(null);
  }

  function selectEvent(id: number, from: HTMLElement) {
    origin.current = from;
    setFocusOnOpen(true);
    setFromDate(null);
    setSelection({type: 'event', id});
  }

  function selectDay(date: string, from: HTMLElement) {
    origin.current = from;
    setFocusOnOpen(true);
    setFromDate(null);
    setSelection({type: 'day', date});
  }

  const closePanel = useCallback((returnFocus: boolean) => {
    setSelection(null);
    setFromDate(null);
    const target = origin.current;
    origin.current = null;
    if (!returnFocus || !target) return;
    // The bar may have re-rendered (e.g. events reloaded) — fall back to the
    // first bar of the same event.
    const eventId = target.dataset.msEvent;
    requestAnimationFrame(() => {
      // Reopened within the same frame (e.g. Esc then Enter): the new panel owns focus.
      if (document.querySelector('[role="dialog"][aria-labelledby="ms-panel-title"]')) return;
      const el = target.isConnected ? target : eventId ? document.querySelector<HTMLElement>(`[data-ms-event="${eventId}"]`) : null;
      el?.focus();
    });
  }, []);

  const {from: monthFrom, to: monthTo} = monthRange(month);
  const monthEvents = events.filter((e) => overlapsRange(e, monthFrom, monthTo));
  const selectedEvent = selection?.type === 'event' ? events.find((e) => e.id === selection.id) ?? null : null;
  const panelView =
    selection?.type === 'event'
      ? selectedEvent && {type: 'event' as const, event: selectedEvent, fromDate}
      : selection?.type === 'day'
        ? {type: 'day' as const, date: selection.date}
        : null;

  return (
    <>
      <div className={styles.pageHead}>
        <h1>모터스포츠 일정</h1>
        <p>서킷 스포츠주행일과 F1 · WEC · 국내 레이스 일정을 한곳에서 확인하세요. 검증된 공식 출처가 있는 일정만 올라옵니다.</p>
      </div>

      <MotorsportFilters
        view={view}
        onViewChange={setView}
        month={month}
        onMonthChange={changeMonth}
        kind={kind}
        onKindChange={setKind}
        scope={scope}
        onScopeChange={setScope}
      />

      <div aria-live="polite" aria-busy={loading}>
        {failed ? (
          <p className={styles.empty}>일정을 불러오지 못했어요. 새로고침해주세요.</p>
        ) : loading && !events.length ? (
          <p className={styles.empty}>일정을 불러오고 있어요.</p>
        ) : view === 'calendar' ? (
          <div className={styles.calendarLayout} data-loading={loading || undefined}>
            <MotorsportCalendar
              month={month}
              events={events}
              today={today}
              maxLanes={mobile ? 2 : 3}
              selection={panelView ? selection : null}
              onSelectEvent={selectEvent}
              onSelectDay={selectDay}
            />
            {!loading && !monthEvents.length && <p className={styles.empty}>이 달에는 등록된 일정이 없어요.</p>}
          </div>
        ) : (
          <div data-loading={loading || undefined}>
            <MotorsportList events={monthEvents} today={today} />
          </div>
        )}
      </div>

      {view === 'calendar' && panelView && (
        <MotorsportEventPanel
          view={panelView}
          events={events}
          today={today}
          modal={mobile}
          focusOnOpen={focusOnOpen}
          onSelectEvent={(id, date) => {
            setFromDate(date);
            setSelection({type: 'event', id});
          }}
          onBackToDay={(date) => {
            setFromDate(null);
            setSelection({type: 'day', date});
          }}
          onClose={closePanel}
        />
      )}
    </>
  );
}
