'use client';

import {useEffect, useRef, useState} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {fetchEvents} from '../../lib/motorsport-api';
import {kstToday, monthKey, monthRange} from '../../lib/motorsport';
import type {EventKind, PublicEvent, SeriesScope} from '../../lib/motorsport-types';
import MotorsportFilters from './motorsport-filters';
import MotorsportCalendar from './motorsport-calendar';
import MotorsportDayPanel from './motorsport-day-panel';
import MotorsportList from './motorsport-list';
import styles from './motorsport.module.css';

const isKind = (value: string | null): value is EventKind => value === 'RACE' || value === 'TRACK_DAY' || value === 'EVENT';
const isScope = (value: string | null): value is SeriesScope => value === 'DOMESTIC' || value === 'INTERNATIONAL';
const isMonth = (value: string | null): value is string => !!value && /^\d{4}-\d{2}$/.test(value);
const isDate = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

// /motorsport — 공개 캘린더·리스트. board-service의 공개 API만 쓴다
// (/api/board/motorsport/events, 로그인 불필요). 월·보기·필터·선택한 날짜를
// URL과 동기화해 공유 가능한 주소로 만든다(components/community/community-list.tsx와 같은 방식).
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
  const [selectedDate, setSelectedDate] = useState<string | null>(() => {
    const value = searchParams.get('date');
    return isDate(value) ? value : null;
  });

  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== 'calendar') params.set('view', view);
    if (month !== monthKey(today)) params.set('month', month);
    if (kind) params.set('kind', kind);
    if (scope) params.set('scope', scope);
    if (selectedDate) params.set('date', selectedDate);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, {scroll: false});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, month, kind, scope, selectedDate]);

  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const ticket = useRef(0);

  useEffect(() => {
    const current = ++ticket.current;
    setLoading(true);
    setFailed(false);
    const {from, to} = monthRange(month);
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
    setSelectedDate(null);
  }

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
            <MotorsportCalendar month={month} events={events} today={today} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            {/* 아직 날짜를 고르지 않았다면: 지금 보고 있는 달이 이번 달이면 오늘, 아니면(예: 12월을 보는 중인데
                today는 10월) 화면에 보이는 달과 무관한 "오늘" 패널이 뜨지 않도록 그 달 1일을 기본값으로 쓴다. */}
            <MotorsportDayPanel
              date={selectedDate ?? (month === monthKey(today) ? today : monthRange(month).from)}
              events={events}
              today={today}
            />
          </div>
        ) : (
          <div data-loading={loading || undefined}>
            <MotorsportList events={events} today={today} />
          </div>
        )}
      </div>
    </>
  );
}
