'use client';

import {useEffect, useRef, useState, type CSSProperties, type RefObject} from 'react';
import {countryName, eventPhase, eventsOnDate, kstDateTimeLabel, localDateLabel, localRangeLabel, seriesStyle} from '../../lib/motorsport';
import {KIND_LABELS, PHASE_LABELS, type PublicEvent} from '../../lib/motorsport-types';
import {motorsportUrl} from '../../lib/format';
import styles from './motorsport.module.css';

const STATUS_TAG: Record<PublicEvent['status'], string | null> = {
  SCHEDULED: null,
  TENTATIVE: '일정 잠정',
  CHANGED: '일정 변경',
  CANCELLED: '취소',
};

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  // What to show: one event, or every event on a day ("+N개").
  view: {type: 'event'; event: PublicEvent; fromDate: string | null} | {type: 'day'; date: string};
  events: PublicEvent[];
  today: string;
  // Bottom sheet below 600px: modal (focus trap, background scroll lock).
  // Above it the panel is a non-modal side panel over the calendar.
  modal: boolean;
  // Set when the panel was opened by pressing a calendar control — then focus
  // moves into the panel. Not set when it opens from a shared URL.
  focusOnOpen: boolean;
  onSelectEvent: (id: number, fromDate: string | null) => void;
  onBackToDay: (date: string) => void;
  onClose: (returnFocus: boolean) => void;
};

export default function MotorsportEventPanel({view, events, today, modal, focusOnOpen, onSelectEvent, onBackToDay, onClose}: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [shown, setShown] = useState(false);
  const viewKey = view.type === 'event' ? `e${view.event.id}` : `d${view.date}`;

  // Slide in on the next frame (transform transition from off-screen).
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Each new content (other bar, day list ↔ event) starts at the top, and the
  // heading takes focus so screen readers announce the change.
  useEffect(() => {
    panelRef.current?.querySelector(`.${styles.panelBody}`)?.scrollTo?.({top: 0});
    if (focusOnOpen || modal) headingRef.current?.focus({preventScroll: true});
  }, [viewKey, focusOnOpen, modal]);

  // Esc closes (focus back to the bar). A press outside the panel closes it
  // too, except on calendar bars / "+N" (data-ms-keep-panel): those switch the
  // content in one click instead.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(true);
        return;
      }
      if (e.key !== 'Tab' || !modal || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target || panelRef.current?.contains(target)) return;
      if (!modal && target.closest('[data-ms-keep-panel]')) return;
      onClose(false);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [modal, onClose]);

  // Background scroll lock for the mobile sheet only.
  useEffect(() => {
    if (!modal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [modal]);

  const title = view.type === 'event' ? view.event.title : `${localDateLabel(view.date)} 일정`;

  return (
    <>
      {modal && <div className={styles.sheetScrim} data-shown={shown || undefined} aria-hidden="true" />}
      <aside
        ref={panelRef}
        className={styles.eventPanel}
        data-shown={shown || undefined}
        role="dialog"
        aria-modal={modal}
        aria-labelledby="ms-panel-title"
      >
        <div className={styles.panelTop}>
          {view.type === 'event' && view.fromDate ? (
            <button type="button" className={styles.panelBack} onClick={() => onBackToDay(view.fromDate!)}>
              ← {localDateLabel(view.fromDate)} 일정
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={styles.panelClose} aria-label="닫기" onClick={() => onClose(true)}>
            ×
          </button>
        </div>
        <div className={styles.panelBody}>
          {view.type === 'event' ? (
            <EventBody event={view.event} today={today} headingRef={headingRef} />
          ) : (
            <DayBody events={eventsOnDate(events, view.date)} today={today} headingRef={headingRef} title={title} onSelect={(id) => onSelectEvent(id, view.date)} />
          )}
        </div>
      </aside>
    </>
  );
}

function EventBody({event, today, headingRef}: {event: PublicEvent; today: string; headingRef: RefObject<HTMLHeadingElement | null>}) {
  const phase = eventPhase(event, today);
  const look = seriesStyle(event);
  const statusTag = STATUS_TAG[event.status];
  return (
    // div, not article: app/globals.css still styles bare `article` as a dark card (legacy theme).
    <div>
      {/* 1. 시리즈와 일정 상태 */}
      <div className={styles.detailTags}>
        <span className={styles.seriesChip} style={{'--bar': look.color} as CSSProperties}>
          {event.series ? event.series.name : look.label}
        </span>
        <span className={styles.tag}>{KIND_LABELS[event.kind]}</span>
        <span className={`${styles.phaseTag} ${styles[`phase-${phase}`]}`}>{PHASE_LABELS[phase]}</span>
        {statusTag && <span className={styles.statusTag}>{statusTag}</span>}
      </div>
      {/* 2. 대회명 */}
      <h2 id="ms-panel-title" ref={headingRef} tabIndex={-1} className={styles.panelTitle}>
        {event.title}
      </h2>
      <dl className={styles.panelMeta}>
        {/* 3. 한국 기준 시각 — startsAt은 행사 시작 시각(첫 세션일 수 있음)이지 결승 시각이 아니다. */}
        <div>
          <dt>시작 시각(한국)</dt>
          <dd>{event.startsAt ? `${kstDateTimeLabel(event.startsAt)} (KST)` : '주최 측이 시각을 공지하지 않았어요'}</dd>
        </div>
        {/* 4. 현지 행사 기간 */}
        <div>
          <dt>행사 기간(현지)</dt>
          <dd>
            {localRangeLabel(event.startsOn, event.endsOn)}
            <small>{event.venue.timezone} 기준 날짜</small>
          </dd>
        </div>
        {/* 5. 장소 */}
        <div>
          <dt>장소</dt>
          <dd>
            {event.venue.name}
            <small>{[event.venue.region, countryName(event.venue.country)].filter(Boolean).join(' · ')}</small>
          </dd>
        </div>
      </dl>
      {/* 6. 메모 — 결승 등 세부 시각은 메모에 적힌 그대로 보여준다(파싱하지 않음). */}
      {event.note && (
        <div className={styles.panelNote}>
          <h3>메모</h3>
          <p>{event.note}</p>
        </div>
      )}
      {/* 7. 공식 일정 링크 */}
      <div className={styles.panelLinks}>
        <a className={styles.detailLink} href={event.sourceUrl} target="_blank" rel="noopener noreferrer">
          공식 일정 · {event.sourceName} ↗
        </a>
        {event.bookingUrl && (
          <a className={styles.detailLink} href={event.bookingUrl} target="_blank" rel="noopener noreferrer">
            예약 안내 ↗
          </a>
        )}
        {/* 기존 상세 페이지(연결된 이야기 목록 포함)로 가는 길 */}
        <a className={styles.detailLink} href={motorsportUrl(event.id)}>
          일정 상세{event.linkedPostCount > 0 ? ` · 이야기 ${event.linkedPostCount}개` : ''} →
        </a>
      </div>
      <p className={styles.detailFoot}>{event.verifiedOn} 공식 출처 확인</p>
    </div>
  );
}

function DayBody({
  events,
  today,
  title,
  headingRef,
  onSelect,
}: {
  events: PublicEvent[];
  today: string;
  title: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSelect: (id: number) => void;
}) {
  return (
    <div>
      <h2 id="ms-panel-title" ref={headingRef} tabIndex={-1} className={styles.panelTitle}>
        {title}
      </h2>
      <p className={styles.panelCaption}>현지 날짜 기준 · {events.length}건</p>
      {events.length ? (
        <ol className={styles.list}>
          {events.map((event) => {
            const look = seriesStyle(event);
            const phase = eventPhase(event, today);
            return (
              <li key={event.id}>
                <button type="button" className={styles.dayItem} onClick={() => onSelect(event.id)}>
                  <span className={styles.seriesChip} style={{'--bar': look.color} as CSSProperties}>
                    {look.label}
                  </span>
                  <span className={styles.rowTitle}>{event.title}</span>
                  <span className={styles.rowMeta}>
                    <span>{PHASE_LABELS[phase]}</span>
                    {event.status !== 'SCHEDULED' && <span>{STATUS_TAG[event.status]}</span>}
                    <span>{event.venue.name}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.empty}>이 날짜에는 등록된 일정이 없어요.</p>
      )}
    </div>
  );
}
